import { singleton } from 'tsyringe';
import EventEmitter from './EventEmitter.js';
import type AbstractBaseEvent from './events/AbstractBaseEvent.js';

@singleton()
export default class EventRegistry {
  private readonly registry = new Map<Function, EventEmitter<AbstractBaseEvent>>();

  for<T extends AbstractBaseEvent>(eventClass: new (...args: any[]) => T): EventEmitter<T> {
    let eventEmitter = this.registry.get(eventClass) as EventEmitter<T> | undefined;
    if (eventEmitter != null) {
      return eventEmitter;
    }

    eventEmitter = new EventEmitter<T>();
    this.registry.set(eventClass, eventEmitter as any);
    return eventEmitter;
  }
}
