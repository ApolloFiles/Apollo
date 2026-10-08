import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type ApolloDirectoryProvider from '../../../../../../../../src/config/ApolloDirectoryProvider.js';
import { AniDbBanState } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import { createStrictDeepMock } from '../../../../../../../test-helpers.js';

const BAN_FILE_NAME = 'AniDB-client-ban.json';
const ASSUMED_BAN_DURATION_MS = 8 * 60 * 60 * 1000;

let stateDirectory: string;

function createBanState(directory: string = stateDirectory): AniDbBanState {
  const apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
  apolloDirectoryProvider.getStateBaseDirectory.mockReturnValue(directory);

  return new AniDbBanState(apolloDirectoryProvider);
}

function banFilePath(): string {
  return Path.join(stateDirectory, BAN_FILE_NAME);
}

async function writeBanFile(contents: string): Promise<void> {
  await Fs.promises.writeFile(banFilePath(), contents);
}

async function banFileExists(): Promise<boolean> {
  return Fs.promises.access(banFilePath()).then(() => true, () => false);
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  stateDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-test-'));
});

afterEach(async () => {
  await Fs.promises.rm(stateDirectory, { recursive: true, force: true });
});

describe('AniDbBanState#getActiveBan', () => {
  test('Keeps a ban that is recorded while the ban file is still being read', async () => {
    const subject = createBanState();

    const firstRead = subject.getActiveBan();
    await subject.recordBan('Banned');
    await firstRead;

    await expect(subject.getActiveBan()).resolves.toMatchObject({ reason: 'Banned' });
  });

  test('Never lets a persisted ban last longer than the assumed duration from now', async () => {
    await writeBanFile(JSON.stringify({ bannedAt: '2099-01-01T00:00:00.000Z', reason: 'banned while the clock was ahead' }));
    const subject = createBanState();
    const before = Date.now();

    const ban = await subject.getActiveBan();

    expect(ban?.bannedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(ban?.bannedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(ban!.bannedUntil.getTime() - ban!.bannedAt.getTime()).toBe(ASSUMED_BAN_DURATION_MS);
  });

  test('Returns null without logging when no ban file exists', async () => {
    const subject = createBanState();

    await expect(subject.getActiveBan()).resolves.toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('Propagates an unexpected error while reading the ban file', async () => {
    await Fs.promises.mkdir(banFilePath());
    const subject = createBanState();

    await expect(subject.getActiveBan()).rejects.toThrow(/EISDIR/);
  });

  test('Deletes the ban file and returns null when it contains invalid json', async () => {
    await writeBanFile('this is not json');
    const subject = createBanState();

    await expect(subject.getActiveBan()).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
    await expect(banFileExists()).resolves.toBe(false);
  });

  test('Deletes the ban file and returns null when it violates the schema', async () => {
    await writeBanFile(JSON.stringify({ reason: 'banned for flooding' }));
    const subject = createBanState();

    await expect(subject.getActiveBan()).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
    await expect(banFileExists()).resolves.toBe(false);
  });

  test('Derives the ban end from the assumed duration instead of the file', async () => {
    const bannedAt = new Date();
    await writeBanFile(JSON.stringify({ bannedAt: bannedAt.toISOString(), reason: 'banned for flooding' }));
    const subject = createBanState();

    const activeBan = await subject.getActiveBan();

    expect(activeBan?.bannedAt).toEqual(bannedAt);
    expect(activeBan?.reason).toBe('banned for flooding');
    expect(activeBan!.bannedUntil.getTime() - bannedAt.getTime()).toBe(ASSUMED_BAN_DURATION_MS);
  });

  test('Deletes the ban file and returns null when the ban already expired', async () => {
    const bannedAt = new Date('2020-01-01T00:00:00.000Z');
    await writeBanFile(JSON.stringify({ bannedAt: bannedAt.toISOString(), reason: 'banned for flooding' }));
    const subject = createBanState();

    await expect(subject.getActiveBan()).resolves.toBeNull();
    await expect(banFileExists()).resolves.toBe(false);
  });
});

describe('AniDbBanState#recordBan', () => {
  test('Persists only the ban start and reason so the duration stays derived from the constant', async () => {
    const subject = createBanState();

    await subject.recordBan('banned for flooding');

    const stored = JSON.parse(await Fs.promises.readFile(banFilePath(), 'utf-8'));
    expect(Object.keys(stored).sort()).toEqual(['bannedAt', 'reason']);
    expect(stored.reason).toBe('banned for flooding');
    expect(new Date(stored.bannedAt).toISOString()).toBe(stored.bannedAt);
  });

  test('Leaves no partial file behind', async () => {
    const subject = createBanState();

    await subject.recordBan('banned for flooding');

    await expect(Fs.promises.readdir(stateDirectory)).resolves.toEqual([BAN_FILE_NAME]);
  });

  test('Makes the ban visible to a freshly created instance', async () => {
    await createBanState().recordBan('banned for flooding');

    const activeBan = await createBanState().getActiveBan();

    expect(activeBan?.reason).toBe('banned for flooding');
    expect(activeBan!.bannedUntil.getTime() - activeBan!.bannedAt.getTime()).toBe(ASSUMED_BAN_DURATION_MS);
  });

  test('Keeps the ban in memory when it cannot be persisted', async () => {
    const blockingFile = Path.join(stateDirectory, 'blocker');
    await Fs.promises.writeFile(blockingFile, '');
    const subject = createBanState(Path.join(blockingFile, 'state'));

    await expect(subject.recordBan('banned for flooding')).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
    await expect(subject.getActiveBan()).resolves.toMatchObject({ reason: 'banned for flooding' });
  });
});
