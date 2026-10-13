import type { Mock } from 'vitest';
import EventRegistry from '#src/plugins/builtin/event/EventRegistry.js';
import FileDeletedEvent from '#src/plugins/builtin/event/events/FileDeletedEvent.js';
import FileRenamedEvent from '#src/plugins/builtin/event/events/FileRenamedEvent.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';

const fileSystem = new LocalFileSystem('default', null, { fs_local: { pathOnHost: '/srv/apollo/users/kD8fQ2mXv7LpR4tN9wZ/fs/default' } });

describe(EventRegistry, () => {
  let registry: EventRegistry;

  beforeEach(() => {
    registry = new EventRegistry();
  });

  test('Delivers an event to a listener registered through an earlier lookup of the same event class', async () => {
    const listener: Mock<(event: FileDeletedEvent) => void> = vi.fn();
    registry.for(FileDeletedEvent).on(listener);
    const event = new FileDeletedEvent(fileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'));

    await registry.for(FileDeletedEvent).emit(event);

    expect(listener).toHaveBeenCalledExactlyOnceWith(event);
  });

  test('Does not deliver an event to listeners of a different event class', async () => {
    const deletedListener: Mock<(event: FileDeletedEvent) => void> = vi.fn();
    registry.for(FileDeletedEvent).on(deletedListener);

    await registry.for(FileRenamedEvent).emit(new FileRenamedEvent(
      fileSystem.getFile('/movies/Arrival.mkv'),
      fileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'),
    ));

    expect(deletedListener).not.toHaveBeenCalled();
  });
});
