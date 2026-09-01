/**
 * lib/eventBus.js
 * In-process pub/sub event bus — replaces Redis pub/sub.
 * Used to push real-time order updates from API routes to connected WebSocket clients.
 *
 * Usage (emitting):
 *   import { bus } from '@/lib/eventBus';
 *   bus.emit('order_update', { type: 'STATUS_CHANGE', orderId, orderNo, ... });
 *
 * Usage (subscribing — in server.js WebSocket handler):
 *   bus.on('order_update', handler);
 *   bus.off('order_update', handler);  // cleanup on disconnect
 */

import { EventEmitter } from 'events';

// Singleton — same instance reused across all Next.js API route modules
// (guaranteed in Node.js since modules are cached after first require/import)
const globalForBus = globalThis;

if (!globalForBus.__wmsBus) {
  const bus = new EventEmitter();
  bus.setMaxListeners(500); // support up to 500 simultaneous WS clients
  globalForBus.__wmsBus = bus;
}

export const bus = globalForBus.__wmsBus;
export default bus;
