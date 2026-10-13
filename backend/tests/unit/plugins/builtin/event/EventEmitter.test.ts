import type { Mock, MockInstance } from 'vitest';
import EventEmitter from '#src/plugins/builtin/event/EventEmitter.js';
import FileDeletedEvent from '#src/plugins/builtin/event/events/FileDeletedEvent.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';

const fileSystem = new LocalFileSystem('default', null, { fs_local: { pathOnHost: '/srv/apollo/users/kD8fQ2mXv7LpR4tN9wZ/fs/default' } });

describe(EventEmitter, () => {
  let event: FileDeletedEvent;
  let emitter: EventEmitter<FileDeletedEvent>;

  beforeEach(() => {
    event = new FileDeletedEvent(fileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'));
    emitter = new EventEmitter<FileDeletedEvent>();
  });

  test('Resolves when no listener is registered', async () => {
    await expect(emitter.emit(event)).resolves.toBeUndefined();
  });

  test('Passes the event to every registered listener', async () => {
    const firstListener: Mock<(event: FileDeletedEvent) => void> = vi.fn();
    const secondListener: Mock<(event: FileDeletedEvent) => void> = vi.fn();
    emitter.on(firstListener);
    emitter.on(secondListener);

    await emitter.emit(event);

    expect(firstListener).toHaveBeenCalledExactlyOnceWith(event);
    expect(secondListener).toHaveBeenCalledExactlyOnceWith(event);
  });

  test('Calls the listeners in the order they were registered', async () => {
    const calledListeners: string[] = [];
    emitter.on(() => {
      calledListeners.push('cache');
    });
    emitter.on(() => {
      calledListeners.push('library index');
    });

    await emitter.emit(event);

    expect(calledListeners).toEqual(['cache', 'library index']);
  });

  describe('with an async listener', () => {
    let pendingListener: PromiseWithResolvers<void>;
    let nextListener: Mock<(event: FileDeletedEvent) => void>;

    beforeEach(() => {
      pendingListener = Promise.withResolvers<void>();
      nextListener = vi.fn();
      emitter.on(() => pendingListener.promise);
      emitter.on(nextListener);
    });

    test('Does not call the next listener while the async one is still running', async () => {
      void emitter.emit(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(nextListener).not.toHaveBeenCalled();
    });

    test('Calls the next listener once the async one has finished', async () => {
      const emitted = emitter.emit(event);

      pendingListener.resolve();
      await emitted;

      expect(nextListener).toHaveBeenCalledExactlyOnceWith(event);
    });

    test('Stays pending while the async listener is still running', async () => {
      let settled = false;
      void emitter.emit(event).then(() => settled = true);
      await new Promise((resolve) => setImmediate(resolve));

      expect(settled).toBe(false);
    });
  });

  describe('when a listener fails', () => {
    let consoleError: MockInstance<typeof console.error>;
    let nextListener: Mock<(event: FileDeletedEvent) => void>;

    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      nextListener = vi.fn();
    });

    test('Resolves instead of passing the error on to the emitting code', async () => {
      emitter.on(() => Promise.reject(new Error('EIO: i/o error')));

      await expect(emitter.emit(event)).resolves.toBeUndefined();
    });

    test('Still calls the remaining listeners after a rejected promise', async () => {
      emitter.on(() => Promise.reject(new Error('EIO: i/o error')));
      emitter.on(nextListener);

      await emitter.emit(event);

      expect(nextListener).toHaveBeenCalledExactlyOnceWith(event);
    });

    test('Still calls the remaining listeners after a synchronous throw', async () => {
      emitter.on(() => {
        throw new Error('EIO: i/o error');
      });
      emitter.on(nextListener);

      await emitter.emit(event);

      expect(nextListener).toHaveBeenCalledExactlyOnceWith(event);
    });

    test('Logs the error together with the name of the event', async () => {
      const error = new Error('EIO: i/o error');
      emitter.on(() => Promise.reject(error));

      await emitter.emit(event);

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('FileDeletedEvent'), error);
    });
  });
});
