import { EventEmitter } from 'events';

declare global {
  // eslint-disable-next-line no-var
  var __MAP_EMITTER__: EventEmitter | undefined;
}

const emitter: EventEmitter = globalThis.__MAP_EMITTER__ || new EventEmitter();
// Store on global to persist across hot reloads in dev
globalThis.__MAP_EMITTER__ = emitter;

// Increase max listeners to prevent memory leak warnings (multiple SSE connections expected)
emitter.setMaxListeners(50);

export type MapCommand = { type: string; payload: any };

export function publishMapCommands(commands: MapCommand[]) {
  try {
    emitter.emit('message', { commands });
  } catch (e) {
    // noop
  }
}

export function subscribe(handler: (payload: { commands: MapCommand[] }) => void) {
  emitter.on('message', handler);
  return () => emitter.off('message', handler);
}


