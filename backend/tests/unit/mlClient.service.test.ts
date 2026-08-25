/**
 * O contrato deste módulo é "nunca lança, nunca prende".
 *
 * Todo caminho de falha aqui é um caminho que, sem tratamento, apareceria como
 * a Home do app quebrada — então cada um tem teste próprio.
 */
process.env.ML_ENABLED = 'true';
process.env.ML_SERVICE_URL = 'http://ml.test';
process.env.ML_SERVICE_TOKEN = 'token_de_teste_com_16_chars';
process.env.ML_TIMEOUT_MS = '50';
process.env.ML_CIRCUIT_FAILURE_THRESHOLD = '3';
process.env.ML_CIRCUIT_COOLDOWN_MS = '30000';

import { rankProviders, resetCircuit, isMlConfigured } from '../../src/services/mlClient.service';

const payload = {
  request_id: '11111111-1111-1111-1111-111111111111',
  client: { id: 'cli-1', booking_count: 3 },
  context: { category_id: 'plumb', limit: 8 },
  candidates: [{ provider_id: 'pro-1' }],
};

const respostaValida = {
  model_version: '20260101000000-abc',
  strategy: 'ranker',
  latency_ms: 12.5,
  items: [
    { provider_id: 'pro-1', score: 0.9, rank: 1, reasons: [{ code: 'NEARBY', value: 2.1 }] },
  ],
};

function mockFetch(impl: jest.Mock) {
  global.fetch = impl as unknown as typeof fetch;
  return impl;
}

beforeEach(async () => {
  await resetCircuit();
  jest.restoreAllMocks();
});

describe('configuração', () => {
  it('reconhece a integração como configurada', () => {
    expect(isMlConfigured()).toBe(true);
  });
});

describe('caminho feliz', () => {
  it('devolve a resposta parseada', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: true, json: async () => respostaValida }));
    const r = await rankProviders(payload);
    expect(r?.strategy).toBe('ranker');
    expect(r?.items[0].reasons[0].code).toBe('NEARBY');
  });

  it('envia o token de serviço no cabeçalho', async () => {
    const f = mockFetch(jest.fn().mockResolvedValue({ ok: true, json: async () => respostaValida }));
    await rankProviders(payload);
    const headers = f.mock.calls[0][1].headers;
    expect(headers['X-ML-Token']).toBe('token_de_teste_com_16_chars');
  });
});

describe('falhas devolvem null em vez de lançar', () => {
  it('timeout', async () => {
    mockFetch(
      jest.fn().mockRejectedValue(Object.assign(new Error('abort'), { name: 'TimeoutError' })),
    );
    await expect(rankProviders(payload)).resolves.toBeNull();
  });

  it('status não-2xx', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(rankProviders(payload)).resolves.toBeNull();
  });

  it('erro de rede', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(rankProviders(payload)).resolves.toBeNull();
  });

  it('corpo fora do contrato', async () => {
    // Contrato divergente é tão grave quanto serviço fora: ranquear com dado
    // malformado seria pior que degradar.
    mockFetch(
      jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: 'não é lista' }) }),
    );
    await expect(rankProviders(payload)).resolves.toBeNull();
  });

  it('JSON inválido', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('JSON inválido');
        },
      }),
    );
    await expect(rankProviders(payload)).resolves.toBeNull();
  });
});

describe('circuit breaker', () => {
  it('abre após o limite e para de chamar a rede', async () => {
    const f = mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500 }));

    for (let i = 0; i < 3; i++) await rankProviders(payload);
    expect(f).toHaveBeenCalledTimes(3);

    // Com o circuito aberto, nem tenta: é isso que evita pagar o timeout em
    // toda requisição enquanto o dyno free acorda.
    await rankProviders(payload);
    await rankProviders(payload);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('volta a sondar depois do cooldown', async () => {
    const f = mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500 }));
    for (let i = 0; i < 3; i++) await rankProviders(payload);
    expect(f).toHaveBeenCalledTimes(3);

    const agora = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(agora + 31_000);

    f.mockResolvedValue({ ok: true, json: async () => respostaValida });
    const r = await rankProviders(payload);
    expect(f).toHaveBeenCalledTimes(4);
    expect(r?.strategy).toBe('ranker');
  });

  it('um sucesso zera o contador de falhas', async () => {
    const f = mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500 }));
    await rankProviders(payload);
    await rankProviders(payload);

    f.mockResolvedValueOnce({ ok: true, json: async () => respostaValida });
    await rankProviders(payload);

    f.mockResolvedValue({ ok: false, status: 500 });
    await rankProviders(payload);
    await rankProviders(payload);
    // 5 chamadas até aqui e o circuito ainda fechado, porque o sucesso resetou.
    await rankProviders(payload);
    expect(f).toHaveBeenCalledTimes(6);
  });
});
