import { singleton } from 'tsyringe';
import DatabaseClient from './DatabaseClient.js';

@singleton()
export class DatabaseClockDriftCheck {
  private static readonly DRIFT_TOLERANCE_MS = 10_000;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async check(): Promise<{ driftMs: number, exceedsTolerance: boolean }> {
    const databaseNow = await this.databaseClient.fetchNow();
    const localNow = Date.now();

    const driftMs = Math.abs(localNow - databaseNow.getTime());
    const exceedsTolerance = driftMs > DatabaseClockDriftCheck.DRIFT_TOLERANCE_MS;
    return { driftMs, exceedsTolerance };
  }
}
