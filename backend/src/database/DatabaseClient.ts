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
   */
  async fetchNow(transaction?: Prisma.TransactionClient): Promise<Date> {
    const records = await (transaction ?? this).$queryRaw`SELECT now() as now;`;
    if (!Array.isArray(records) || records.length != 1 || !(records[0].now instanceof Date)) {
      throw new Error('Expected array with one Date-record');
    }

    return records[0].now;
  }

  async runDatabaseMigrations(): Promise<void> {
    ChildProcess.execSync('npm run prisma:migrate:production', { stdio: 'inherit', cwd: APP_ROOT_DIR });
  }

  async dispose(): Promise<void> {
    await this.$disconnect();
  }
}
