import type AbstractBaseEvent from './events/AbstractBaseEvent.js';

export default class EventEmitter<T extends AbstractBaseEvent> {
  private eventListeners: Array<(event: T) => void | Promise<void>> = [];

  on(listener: (event: T) => void | Promise<void>): void {
    this.eventListeners.push(listener);
  }

  async emit(event: T): Promise<void> {
    for (const eventListener of this.eventListeners) {
      await eventListener(event);
    }
  }
}
