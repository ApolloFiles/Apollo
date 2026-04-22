import { PrismaPg } from '@prisma/adapter-pg';
import ChildProcess from 'node:child_process';
import { type Disposable, singleton } from 'tsyringe';
import { APP_ROOT_DIR } from '../constants.js';
import { type Prisma, PrismaClient } from './prisma-client/client.js';

@singleton()
export default class DatabaseClient extends PrismaClient implements Disposable {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      }),
    });
  }

  /**
   * (Workaround for https://github.com/prisma/prisma/issues/5598)
   *
   * TODO: Can we *somehow* get rid of the #fetchNow call across the codebase?
   *       It's just an extra DB call, for the eventuality of highly-out-of-sync server clocks...
   *       Maybe just introduce big warnings in UI and console at startup (or intervals) if a big clock skew is detected and use the local server time?
   *       Would remove an extra DB call on a couple of places (e.g. almost every authenticated request)
   */
  async fetchNow(transaction?: Prisma.TransactionClient): Promise<Date> {
    const records = await (transaction ?? this).$queryRaw`SELECT now() as now;`;
    if (!Array.isArray(records) || records.length != 1 || !(records[0].now instanceof Date)) {
      throw new Error('Expected array with one Date-record');
    }

    return records[0].now;
  }

  async runDatabaseMigrations(): Promise<void> {
    const dbMigrations = ChildProcess.spawnSync(
      'node',
      ['node_modules/.bin/prisma', 'migrate', 'deploy'],
      { stdio: 'inherit', cwd: APP_ROOT_DIR },
    );

    if (dbMigrations.status !== 0) {
      if (dbMigrations.error != null) {
        console.error(dbMigrations.error);
      }

      console.error('Database migrations failed with exit code', dbMigrations.status);
      process.exit(dbMigrations.status ?? 6);
    }
  }

  async dispose(): Promise<void> {
    await this.$disconnect();
  }
}
