/**
 * O que importa não é "o Asaas cobra" — é que o cliente NUNCA lança. Gateway fora,
 * timeout, corpo malformado: tudo vira `null` e o pagamento degrada para o PIX mock.
 */
import {
  createCustomer,
  createPixPayment,
  getPixQrCode,
  isAsaasChargeId,
} from '../../src/services/asaasClient.service';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createCustomer', () => {
  it('cria e devolve o id do cliente', async () => {
    const spy = jest.fn().mockResolvedValue(jsonResponse({ id: 'cus_123', name: 'Ana' }));
    global.fetch = spy as unknown as typeof fetch;

    const id = await createCustomer({ name: 'Ana', email: 'ana@x.com' });

    expect(id).toBe('cus_123');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/customers');
    expect((init.headers as Record<string, string>).access_token).toBe('test_asaas_key');
  });

  it('gateway fora → null, sem lançar', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(createCustomer({ name: 'Ana', email: 'ana@x.com' })).resolves.toBeNull();
  });

  it('5xx → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse('erro', 500)) as unknown as typeof fetch;
    await expect(createCustomer({ name: 'Ana', email: 'ana@x.com' })).resolves.toBeNull();
  });
});

describe('createPixPayment', () => {
  it('cria a cobrança PIX e devolve id/status', async () => {
    const spy = jest.fn().mockResolvedValue(jsonResponse({ id: 'pay_abc', status: 'PENDING', invoiceUrl: 'http://x' }));
    global.fetch = spy as unknown as typeof fetch;

    const charge = await createPixPayment({ customerId: 'cus_1', value: 150, externalReference: 'bk1', description: 'ZELO' });

    expect(charge).toEqual({ id: 'pay_abc', status: 'PENDING', invoiceUrl: 'http://x' });
    const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body);
    expect(body.billingType).toBe('PIX');
    expect(body.value).toBe(150);
    expect(body.customer).toBe('cus_1');
  });

  it('corpo fora do contrato → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ nope: true })) as unknown as typeof fetch;
    await expect(
      createPixPayment({ customerId: 'c', value: 1, externalReference: 'b', description: 'd' }),
    ).resolves.toBeNull();
  });
});

describe('getPixQrCode', () => {
  it('devolve imagem e copia-e-cola', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ encodedImage: 'BASE64', payload: '00020126...', expirationDate: '2026-01-01' }));
    (global as { fetch: unknown }).fetch = global.fetch;

    const qr = await getPixQrCode('pay_abc');
    expect(qr?.encodedImage).toBe('BASE64');
    expect(qr?.payload).toContain('000201');
  });
});

describe('isAsaasChargeId', () => {
  it('reconhece um id de cobrança do Asaas', () => {
    expect(isAsaasChargeId('pay_abc')).toBe(true);
    expect(isAsaasChargeId('pix_deadbeef')).toBe(false);
    expect(isAsaasChargeId(null)).toBe(false);
  });
});
