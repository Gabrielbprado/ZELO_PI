import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexto por-request, propagado sem precisar passar parâmetros por toda a pilha.
 *
 * O `requestId` entra aqui no middleware e fica disponível em qualquer ponto do
 * processamento daquela request — no logger (via mixin), no `recordEvent` (que o grava
 * no outbox) — sem que services precisem conhecê-lo. É o que permite um rastro único da
 * request HTTP até o push entregue pelo microserviço, atravessando o RabbitMQ.
 */
interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
