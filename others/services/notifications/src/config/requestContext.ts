import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexto por-processamento. O consumidor reidrata aqui o `x-request-id` que veio no
 * header AMQP, e o logger o injeta em cada linha — fechando o rastro que começou na
 * request HTTP do backend e termina no push deste serviço.
 */
interface Context {
  requestId: string;
}

const storage = new AsyncLocalStorage<Context>();

export function runWithRequestContext<T>(ctx: Context, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
