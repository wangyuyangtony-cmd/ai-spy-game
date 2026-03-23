import { EventEmitter } from 'events';

/**
 * Game event bus for cross-module communication.
 * Used primarily for owner confirmation flow:
 *   - WebSocket handler emits 'confirm:{gameId}:{confirmType}'
 *   - Engine awaits the event before continuing the game loop
 */
export const gameEventBus = new EventEmitter();
gameEventBus.setMaxListeners(100);
