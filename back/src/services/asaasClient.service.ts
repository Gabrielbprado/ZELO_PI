import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const customerSchema = z.object({ id: z.string() });
const paymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  invoiceUrl: z.string().optional().nullable(),
});
const paymentDetailsSchema = z.object({
  id: z.string(),
  status: z.string(),
  value: z.number().optional().nullable(),
  externalReference: z.string().optional().nullable(),
  billingType: z.string().optional().nullable(),
});
const pixQrSchema = z.object({
  encodedImage: z.string(),
  payload: z.string(),
  expirationDate: z.string().optional().nullable(),
});
const transferSchema = z.object({ id: z.string(), status: z.string() });

export interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl: string | null;
}
export interface AsaasPaymentDetails {
  id: string;
  status: string;
  value: number | null;
  externalReference: string | null;
  billingType: string | null;
}
export interface AsaasPixQr {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
}

export interface AsaasCreditCardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface AsaasCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export function isAsaasConfigured(): boolean {
  return env.ASAAS_ENABLED && Boolean(env.ASAAS_API_KEY);
}

export function isAsaasChargeId(externalId: string | null | undefined): boolean {
  return typeof externalId === 'string' && externalId.startsWith('pay_');
}

export function mapAsaasStatusToInternal(status: string): 'PAID' | 'FAILED' | 'REFUNDED' | null {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'PAID';
    case 'OVERDUE':
    case 'EXPIRED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
    case 'CANCELLED':
    case 'DUNNING_REQUESTED':
    case 'PAYMENT_DELETED':
      return 'FAILED';
    case 'REFUNDED':
    case 'REFUND_IN_PROGRESS':
    case 'REFUND_REQUESTED':
      return 'REFUNDED';
    default:
      return null;
  }
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}
const circuitState: CircuitState = { failures: 0, lastFailure: 0, open: false };
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

function checkCircuit(): boolean {
  if (!circuitState.open) return true;
  if (Date.now() - circuitState.lastFailure > CIRCUIT_COOLDOWN_MS) {
    circuitState.open = false;
    circuitState.failures = 0;
    logger.info('asaas circuit breaker fechado (cooldown expirado)');
    return true;
  }
  return false;
}

function recordFailure() {
  circuitState.failures += 1;
  circuitState.lastFailure = Date.now();
  if (circuitState.failures >= CIRCUIT_THRESHOLD) {
    circuitState.open = true;
    logger.warn('asaas circuit breaker ABERTO após 3 falhas consecutivas');
  }
}

function recordSuccess() {
  circuitState.failures = 0;
  circuitState.open = false;
}

async function asaasFetch(path: string, init: RequestInit): Promise<Response | null> {
  if (!isAsaasConfigured()) return null;
  if (!checkCircuit()) {
    logger.warn('asaas: circuit breaker aberto, falha rápida');
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.ASAAS_TIMEOUT_MS);
    const res = await fetch(`${env.ASAAS_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        access_token: env.ASAAS_API_KEY as string,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    recordSuccess();
    return res;
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err: timedOut ? 'timeout' : err }, 'asaas: falha na chamada');
    recordFailure();
    return null;
  }
}

async function parse<T>(res: Response | null, schema: z.ZodType<T>, ctx: string): Promise<T | null> {
  if (!res) return null;
  if (!res.ok) {
    // Lê o corpo pra ter o motivo real do erro (`errors[].description` na Asaas).
    // Sem isso, o único sintoma visível era "resposta não-2xx" e o diagnóstico ficava cego.
    const body = await res.text().catch(() => '');
    logger.warn({ status: res.status, ctx, body: body.slice(0, 500) }, 'asaas: resposta não-2xx');
    return null;
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    logger.warn({ ctx }, 'asaas: resposta fora do contrato');
    return null;
  }
  return parsed.data;
}

export async function createCustomer(input: { name: string; email: string; cpfCnpj?: string }): Promise<string | null> {
  const res = await asaasFetch('/customers', { method: 'POST', body: JSON.stringify(input) });
  const data = await parse(res, customerSchema, 'createCustomer');
  return data?.id ?? null;
}

export async function createPixPayment(input: {
  customerId: string;
  value: number;
  externalReference: string;
  description: string;
}): Promise<AsaasPayment | null> {
  const dueDate = new Date().toISOString().slice(0, 10);
  const res = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: 'PIX',
      value: input.value,
      dueDate,
      externalReference: input.externalReference,
      description: input.description,
    }),
  });
  const data = await parse(res, paymentSchema, 'createPixPayment');
  return data ? { id: data.id, status: data.status, invoiceUrl: data.invoiceUrl ?? null } : null;
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQr | null> {
  const res = await asaasFetch(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, { method: 'GET' });
  const data = await parse(res, pixQrSchema, 'getPixQrCode');
  return data ? { encodedImage: data.encodedImage, payload: data.payload, expirationDate: data.expirationDate ?? null } : null;
}

export async function createCardPayment(input: {
  customerId: string;
  value: number;
  installmentCount: number;
  installmentValue: number;
  externalReference: string;
  description: string;
  card: AsaasCreditCardInput;
  holder: AsaasCardHolderInfo;
  remoteIp: string;
}): Promise<AsaasPayment | null> {
  const dueDate = new Date().toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: 'CREDIT_CARD',
    value: input.value,
    dueDate,
    externalReference: input.externalReference,
    description: input.description,
    creditCard: {
      holderName: input.card.holderName,
      number: input.card.number,
      expiryMonth: input.card.expiryMonth,
      expiryYear: input.card.expiryYear,
      ccv: input.card.ccv,
    },
    creditCardHolderInfo: {
      name: input.holder.name,
      email: input.holder.email,
      cpfCnpj: input.holder.cpfCnpj,
      postalCode: input.holder.postalCode,
      addressNumber: input.holder.addressNumber,
      phone: input.holder.phone,
    },
    remoteIp: input.remoteIp,
  };
  if (input.installmentCount > 1) {
    body.installmentCount = input.installmentCount;
    body.installmentValue = input.installmentValue;
  }
  const res = await asaasFetch('/payments', { method: 'POST', body: JSON.stringify(body) });
  const data = await parse(res, paymentSchema, 'createCardPayment');
  return data ? { id: data.id, status: data.status, invoiceUrl: data.invoiceUrl ?? null } : null;
}

export async function getPayment(paymentId: string): Promise<AsaasPaymentDetails | null> {
  const res = await asaasFetch(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  const data = await parse(res, paymentDetailsSchema, 'getPayment');
  return data
    ? {
        id: data.id,
        status: data.status,
        value: data.value ?? null,
        externalReference: data.externalReference ?? null,
        billingType: data.billingType ?? null,
      }
    : null;
}

/** Transferência PIX (saque): manda o valor da conta Asaas da plataforma para uma chave PIX. */
export async function createTransfer(input: { value: number; pixKey: string; description?: string }): Promise<{ id: string; status: string } | null> {
  const res = await asaasFetch('/transfers', {
    method: 'POST',
    body: JSON.stringify({ value: input.value, pixAddressKey: input.pixKey, operationType: 'PIX', description: input.description }),
  });
  const data = await parse(res, transferSchema, 'createTransfer');
  return data ? { id: data.id, status: data.status } : null;
}
