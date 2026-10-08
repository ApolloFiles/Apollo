import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import { AniDbBanState } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const BAN_FILE_NAME = 'AniDB-client-ban.json';

describe(AniDbBanState, () => {
  let stateDirectory: string;
  let apolloDirectoryProvider: DeepMockProxy<ApolloDirectoryProvider>;
  let subject: AniDbBanState;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
    stateDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-test-'));

    apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
    apolloDirectoryProvider.getStateBaseDirectory.mockReturnValue(stateDirectory);

    subject = new AniDbBanState(apolloDirectoryProvider);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Fs.promises.rm(stateDirectory, { recursive: true, force: true });
  });

  function banFilePath(): string {
    return Path.join(stateDirectory, BAN_FILE_NAME);
  }

  async function writeBanFile(contents: string): Promise<void> {
    await Fs.promises.writeFile(banFilePath(), contents);
  }

  async function banFileExists(): Promise<boolean> {
    return Fs.promises.access(banFilePath()).then(() => true, () => false);
  }

  describe('getActiveBan', () => {
    test('Keeps a ban that is recorded while the ban file is still being read', async () => {
      const firstRead = subject.getActiveBan();
      await subject.recordBan('Banned');
      await firstRead;

      await expect(subject.getActiveBan()).resolves.toMatchObject({ reason: 'Banned' });
    });

    test('Derives the ban end from an assumed duration of eight hours', async () => {
      await writeBanFile(JSON.stringify({ bannedAt: '2026-03-14T10:00:00.000Z', reason: 'banned for flooding' }));

      await expect(subject.getActiveBan()).resolves.toEqual({
        bannedAt: new Date('2026-03-14T10:00:00.000Z'),
        bannedUntil: new Date('2026-03-14T18:00:00.000Z'),
        reason: 'banned for flooding',
      });
    });

    test('Never lets a persisted ban last longer than the assumed duration from now', async () => {
      await writeBanFile(JSON.stringify({ bannedAt: '2099-01-01T00:00:00.000Z', reason: 'banned while the clock was ahead' }));

      await expect(subject.getActiveBan()).resolves.toEqual({
        bannedAt: new Date('2026-03-14T12:00:00.000Z'),
        bannedUntil: new Date('2026-03-14T20:00:00.000Z'),
        reason: 'banned while the clock was ahead',
      });
    });

    test('Returns null without logging when no ban file exists', async () => {
      await expect(subject.getActiveBan()).resolves.toBeNull();

      expect(console.error).not.toHaveBeenCalled();
    });

    test('Propagates an unexpected error while reading the ban file', async () => {
      await Fs.promises.mkdir(banFilePath());

      await expect(subject.getActiveBan()).rejects.toMatchObject({ code: 'EISDIR' });
    });

    test.for([
      { problem: 'contains invalid json', contents: 'this is not json' },
      { problem: 'violates the schema', contents: '{"reason":"banned for flooding"}' },
    ])('Deletes the ban file, logs an error and returns null when it $problem', async ({ contents }) => {
      await writeBanFile(contents);

      await expect(subject.getActiveBan()).resolves.toBeNull();

      expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('ban state file is corrupted'), expect.any(Error));
      await expect(banFileExists()).resolves.toBe(false);
    });

    test('Deletes the ban file and returns null when the ban already expired', async () => {
      await writeBanFile(JSON.stringify({ bannedAt: '2026-03-14T03:59:59.000Z', reason: 'banned for flooding' }));

      await expect(subject.getActiveBan()).resolves.toBeNull();

      await expect(banFileExists()).resolves.toBe(false);
    });
  });

  describe('recordBan', () => {
    test('Persists only the ban start and reason', async () => {
      await subject.recordBan('banned for flooding');

      const stored = JSON.parse(await Fs.promises.readFile(banFilePath(), 'utf-8'));
      expect(stored).toStrictEqual({ bannedAt: '2026-03-14T12:00:00.000Z', reason: 'banned for flooding' });
    });

    test('Leaves no partial file behind', async () => {
      await subject.recordBan('banned for flooding');

      await expect(Fs.promises.readdir(stateDirectory)).resolves.toEqual([BAN_FILE_NAME]);
    });

    test('Makes the ban visible to a freshly created instance', async () => {
      await subject.recordBan('banned for flooding');

      const activeBan = await new AniDbBanState(apolloDirectoryProvider).getActiveBan();

      expect(activeBan).toEqual({
        bannedAt: new Date('2026-03-14T12:00:00.000Z'),
        bannedUntil: new Date('2026-03-14T20:00:00.000Z'),
        reason: 'banned for flooding',
      });
    });

    test('Keeps the ban in memory, and logs an error, when it cannot be persisted', async () => {
      const blockingFile = Path.join(stateDirectory, 'blocker');
      await Fs.promises.writeFile(blockingFile, '');
      apolloDirectoryProvider.getStateBaseDirectory.mockReturnValue(Path.join(blockingFile, 'state'));

      await expect(subject.recordBan('banned for flooding')).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unable to persist the AniDB ban state'), expect.any(Error));
      await expect(subject.getActiveBan()).resolves.toMatchObject({ reason: 'banned for flooding' });
    });
  });
});
