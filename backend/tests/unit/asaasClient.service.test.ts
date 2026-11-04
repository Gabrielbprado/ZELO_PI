/**
 * O que importa não é "o Asaas cobra" — é que o cliente NUNCA lança. Gateway fora,
 * timeout, corpo malformado: tudo vira `null`. A camada superior (`payments.service`)
 * é quem decide o que fazer com o null.
 */
import {
  createCustomer,
  createPixPayment,
  createCardPayment,
  getPayment,
  getPixQrCode,
  isAsaasChargeId,
  mapAsaasStatusToInternal,
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

describe('createCardPayment', () => {
  const baseInput = {
    customerId: 'cus_1',
    value: 199.9,
    installmentCount: 3,
    installmentValue: 66.63,
    externalReference: 'bk1',
    description: 'ZELO',
    card: { holderName: 'ANA SILVA', number: '5162306101010019', expiryMonth: '12', expiryYear: '2030', ccv: '318' },
    holder: {
      name: 'Ana Silva',
      email: 'ana@x.com',
      cpfCnpj: '12345678901',
      postalCode: '01310100',
      addressNumber: '1500',
      phone: '11999999999',
    },
    remoteIp: '127.0.0.1',
  };

  it('cria a cobrança parcelada com creditCard + holderInfo', async () => {
    const spy = jest.fn().mockResolvedValue(jsonResponse({ id: 'pay_card_1', status: 'CONFIRMED' }));
    global.fetch = spy as unknown as typeof fetch;

    const charge = await createCardPayment(baseInput);

    expect(charge).toEqual({ id: 'pay_card_1', status: 'CONFIRMED', invoiceUrl: null });
    const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body);
    expect(body.billingType).toBe('CREDIT_CARD');
    expect(body.installmentCount).toBe(3);
    expect(body.installmentValue).toBe(66.63);
    expect(body.creditCard.number).toBe('5162306101010019');
    expect(body.creditCardHolderInfo.postalCode).toBe('01310100');
    expect(body.remoteIp).toBe('127.0.0.1');
  });

  it('à vista (installmentCount=1) não envia installmentCount/installmentValue', async () => {
    const spy = jest.fn().mockResolvedValue(jsonResponse({ id: 'pay_card_2', status: 'CONFIRMED' }));
    global.fetch = spy as unknown as typeof fetch;

    await createCardPayment({ ...baseInput, installmentCount: 1, installmentValue: 199.9 });

    const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body);
    expect(body.installmentCount).toBeUndefined();
    expect(body.installmentValue).toBeUndefined();
    expect(body.value).toBe(199.9);
  });

  it('cartão recusado (400) → null', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: 'invalid_credit_card' }] }), { status: 400 })) as unknown as typeof fetch;
    await expect(createCardPayment(baseInput)).resolves.toBeNull();
  });
});

describe('getPayment', () => {
  it('devolve detalhes do pagamento', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ id: 'pay_abc', status: 'RECEIVED', value: 150, externalReference: 'bk1', billingType: 'PIX' }),
    ) as unknown as typeof fetch;

    const details = await getPayment('pay_abc');
    expect(details).toEqual({
      id: 'pay_abc',
      status: 'RECEIVED',
      value: 150,
      externalReference: 'bk1',
      billingType: 'PIX',
    });
  });

  it('404 → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 404 })) as unknown as typeof fetch;
    await expect(getPayment('pay_nope')).resolves.toBeNull();
  });
});

describe('getPixQrCode', () => {
  it('devolve imagem e copia-e-cola', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ encodedImage: 'BASE64', payload: '00020126...', expirationDate: '2026-01-01' })) as unknown as typeof fetch;

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
    expect(isAsaasChargeId(undefined)).toBe(false);
  });
});

describe('mapAsaasStatusToInternal', () => {
  it.each([
    ['RECEIVED', 'PAID'],
    ['CONFIRMED', 'PAID'],
    ['RECEIVED_IN_CASH', 'PAID'],
    ['OVERDUE', 'FAILED'],
    ['CANCELLED', 'FAILED'],
    ['EXPIRED', 'FAILED'],
    ['CHARGEBACK_DISPUTE', 'FAILED'],
    ['REFUNDED', 'REFUNDED'],
    ['REFUND_IN_PROGRESS', 'REFUNDED'],
    ['PENDING', null],
    ['AWAITING_RISK_ANALYSIS', null],
    ['??UNKNOWN??', null],
  ])('%s → %s', (status, expected) => {
    expect(mapAsaasStatusToInternal(status)).toBe(expected);
  });
});
