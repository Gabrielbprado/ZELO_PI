import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Único módulo que fala com o Asaas. Mesma disciplina do `mlClient`/`notificationsClient`:
 * **nunca lança**. Timeout, 5xx, corpo fora do contrato — tudo vira `null`, e o fluxo de
 * pagamento degrada para o PIX mock. Cobrar não pode derrubar a request; e um ambiente sem
 * conta no gateway (dev/demo) tem que continuar funcionando.
 */

const customerSchema = z.object({ id: z.string() });
const paymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  invoiceUrl: z.string().optional().nullable(),
});
const pixQrSchema = z.object({
  encodedImage: z.string(),
  payload: z.string(),
  expirationDate: z.string().optional().nullable(),
});

export interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl: string | null;
}
export interface AsaasPixQr {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
}

export function isAsaasConfigured(): boolean {
  return env.ASAAS_ENABLED && Boolean(env.ASAAS_API_KEY);
}

/** Um id do Asaas começa com `pay_` — usado para decidir se um Payment é real ou mock. */
export function isAsaasChargeId(externalId: string | null | undefined): boolean {
  return typeof externalId === 'string' && externalId.startsWith('pay_');
}

async function asaasFetch(path: string, init: RequestInit): Promise<Response | null> {
  if (!isAsaasConfigured()) return null;
  try {
    return await fetch(`${env.ASAAS_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        access_token: env.ASAAS_API_KEY as string,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(env.ASAAS_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    logger.warn({ err: timedOut ? 'timeout' : err }, 'asaas: falha na chamada');
    return null;
  }
}

async function parse<T>(res: Response | null, schema: z.ZodType<T>, ctx: string): Promise<T | null> {
  if (!res) return null;
  if (!res.ok) {
    logger.warn({ status: res.status, ctx }, 'asaas: resposta não-2xx');
    return null;
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    logger.warn({ ctx }, 'asaas: resposta fora do contrato');
    return null;
  }
  return parsed.data;
}

/** Cria (ou reusa via id já salvo) o cliente no Asaas. Devolve o id, ou `null`. */
export async function createCustomer(input: { name: string; email: string; cpfCnpj?: string }): Promise<string | null> {
  const res = await asaasFetch('/customers', { method: 'POST', body: JSON.stringify(input) });
  const data = await parse(res, customerSchema, 'createCustomer');
  return data?.id ?? null;
}

/** Cria uma cobrança PIX. `externalReference` liga o webhook de volta ao nosso Payment. */
export async function createPixPayment(input: {
  customerId: string;
  value: number;
  externalReference: string;
  description: string;
}): Promise<AsaasPayment | null> {
  const dueDate = new Date().toISOString().slice(0, 10); // hoje (PIX é pago na hora)
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

/** Busca o QR Code PIX (imagem base64 + copia-e-cola) de uma cobrança. */
export async function getPixQrCode(paymentId: string): Promise<AsaasPixQr | null> {
  const res = await asaasFetch(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, { method: 'GET' });
  const data = await parse(res, pixQrSchema, 'getPixQrCode');
  return data ? { encodedImage: data.encodedImage, payload: data.payload, expirationDate: data.expirationDate ?? null } : null;
}
