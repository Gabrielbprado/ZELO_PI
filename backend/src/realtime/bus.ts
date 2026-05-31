import { EventEmitter } from 'events';
import type { Message } from '@prisma/client';

/**
 * In-process event bus that decouples domain services from the transport
 * (socket.io). Services emit business events here; the realtime layer
 * subscribes and fans them out to connected clients. Keeping the service
 * free of any socket dependency keeps it unit-testable and lets the
 * realtime layer be optional (e.g. absent in some test setups).
 */
export const REALTIME_EVENTS = {
  MESSAGE_NEW: 'message:new',
} as const;

class RealtimeBus extends EventEmitter {
  emitMessageCreated(message: Message): void {
    this.emit(REALTIME_EVENTS.MESSAGE_NEW, message);
  }

  onMessageCreated(listener: (message: Message) => void): void {
    this.on(REALTIME_EVENTS.MESSAGE_NEW, listener);
  }
}

export const realtimeBus = new RealtimeBus();
