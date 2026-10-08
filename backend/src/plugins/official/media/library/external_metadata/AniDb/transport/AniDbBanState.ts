import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { z } from 'zod';
import ApolloDirectoryProvider from '../../../../../../../config/ApolloDirectoryProvider.js';

/** @internal */
export type AniDbBan = {
  readonly bannedAt: Date,
  readonly bannedUntil: Date,
  readonly reason: string,
};

/** @internal */
@singleton()
export class AniDbBanState {
  /** AniDB does not tell us how long the ban lasts or how long we should wait... */
  private static readonly ASSUMED_BAN_DURATION_MS = 8 * 60 * 60 * 1000;
  private static readonly STATE_FILE_SCHEMA = z.object({
    bannedAt: z.coerce.date(),
    reason: z.string(),
  });

  private activeBan: AniDbBan | null | undefined = undefined;

  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async getActiveBan(): Promise<AniDbBan | null> {
    if (this.activeBan === undefined) {
      const persistedBan = await this.readBanFile();
      this.activeBan ??= persistedBan;
    }

    if (this.activeBan != null && this.activeBan.bannedUntil.getTime() <= Date.now()) {
      this.activeBan = null;
      await this.deleteBanFile();
    }

    return this.activeBan;
  }

  async recordBan(reason: string): Promise<void> {
    this.activeBan = AniDbBanState.createBan(new Date(), reason);

    console.error(`[AniDB] The API banned us (${JSON.stringify(reason)}) – not contacting it again before ${this.activeBan.bannedUntil.toISOString()}`);

    try {
      await this.writeBanFile(this.activeBan);
    } catch (err) {
      console.error('Unable to persist the AniDB ban state – It will be forgotten on app restart', err);
    }
  }

  private async readBanFile(): Promise<AniDbBan | null> {
    let banFileContents: string;
    try {
      banFileContents = await Fs.promises.readFile(this.getBanFilePath(), 'utf-8');
    } catch (err) {
      if ((err as any).code === 'ENOENT') {
        return null;
      }

      throw err;
    }

    try {
      const storedState = AniDbBanState.STATE_FILE_SCHEMA.parse(JSON.parse(banFileContents));
      // a ban recorded while the clock was ahead must not outlast the assumed duration
      return AniDbBanState.createBan(new Date(Math.min(storedState.bannedAt.getTime(), Date.now())), storedState.reason);
    } catch (err) {
      console.error('The AniDB ban state file is corrupted – Ignoring a potential ban and deleting it...', err);
      await this.deleteBanFile();
      return null;
    }
  }

  private async writeBanFile(activeBan: AniDbBan): Promise<void> {
    const banFilePath = this.getBanFilePath();

    await Fs.promises.mkdir(Path.dirname(banFilePath), { recursive: true });

    await Fs.promises.writeFile(
      `${banFilePath}.part`,
      JSON.stringify({
        bannedAt: activeBan.bannedAt.toISOString(),
        reason: activeBan.reason,
      }),
    );
    await Fs.promises.rename(`${banFilePath}.part`, banFilePath);
  }

  private async deleteBanFile(): Promise<void> {
    await Fs.promises.rm(this.getBanFilePath(), { force: true });
  }

  private getBanFilePath(): string {
    return Path.join(this.apolloDirectoryProvider.getStateBaseDirectory(), 'AniDB-client-ban.json');
  }

  private static createBan(bannedAt: Date, reason: string): AniDbBan {
    return {
      bannedAt,
      bannedUntil: new Date(bannedAt.getTime() + AniDbBanState.ASSUMED_BAN_DURATION_MS),
      reason,
    };
  }
}
