import ChildProcess from 'node:child_process';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import Url from 'node:url';
import Pg from 'pg';
import { VITEST_ROOT_DIRECTORY } from '#tests/test-constants.js';
import { removeVitestRootDirectoryIfEmpty } from '#tests/test-helpers.js';

const DEFAULT_DATABASE_URL = 'postgresql://apollo:apollo@localhost:5433/apollo_acceptance';

export const ACCEPTANCE_DATABASE_URL = process.env.APOLLO_ACCEPTANCE_DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
const ACCEPTANCE_ROOT_DIRECTORY = Path.join(VITEST_ROOT_DIRECTORY, 'acceptance');
const ACCEPTANCE_DATA_DIRECTORY = Path.join(ACCEPTANCE_ROOT_DIRECTORY, 'data');
export const ACCEPTANCE_TEMPORARY_TEST_DIRECTORY_ROOT = Path.join(ACCEPTANCE_ROOT_DIRECTORY, 'test-tmp');
export const ACCEPTANCE_FFMPEG_DIRECTORY = Path.join(ACCEPTANCE_ROOT_DIRECTORY, 'ffmpeg');

export const ACCEPTANCE_ENV = {
  DATABASE_URL: ACCEPTANCE_DATABASE_URL,
  APOLLO_DATA_DIRECTORY: ACCEPTANCE_DATA_DIRECTORY,
  APOLLO_TMP_DIRECTORY: '',
  APOLLO_CACHE_DIRECTORY: '',
};

export async function recreateAcceptanceEnvironment(): Promise<void> {
  await removeAcceptanceEnvironment();

  // Nobody connects to the template, so isolated databases can be cloned from it while the tests run
  await runOnMaintenanceDatabase(`CREATE DATABASE ${quoteIdentifier(templateDatabaseName())}`);
  migrateDatabase(withDatabaseName(templateDatabaseName()));
  await runOnMaintenanceDatabase(`CREATE DATABASE ${quoteIdentifier(databaseName())} TEMPLATE ${quoteIdentifier(templateDatabaseName())}`);
  await Fs.promises.mkdir(ACCEPTANCE_DATA_DIRECTORY, { recursive: true });
  await Fs.promises.mkdir(ACCEPTANCE_TEMPORARY_TEST_DIRECTORY_ROOT, { recursive: true });
}

export async function removeAcceptanceEnvironment(): Promise<void> {
  const leftoverIsolatedDatabases = await runOnMaintenanceDatabase(
    'SELECT datname FROM pg_database WHERE starts_with(datname, $1)',
    [isolatedDatabaseNamePrefix()],
  );
  for (const name of [databaseName(), templateDatabaseName(), ...leftoverIsolatedDatabases.map((row) => row.datname as string)]) {
    await runOnMaintenanceDatabase(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
  }
  await Fs.promises.rm(ACCEPTANCE_ROOT_DIRECTORY, { recursive: true, force: true });
  await removeVitestRootDirectoryIfEmpty();
}

/**
 * A freshly migrated database of its own, for tests whose subject works across the whole database
 * (like the cache maintenance jobs) and would otherwise interfere with the test files running in parallel
 */
export async function createIsolatedAcceptanceDatabase(): Promise<{ url: string, drop: () => Promise<void> }> {
  const name = isolatedDatabaseNamePrefix() + Crypto.randomUUID().slice(0, 8);
  await runOnMaintenanceDatabase(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE ${quoteIdentifier(templateDatabaseName())}`);

  return {
    url: withDatabaseName(name),
    drop: async () => {
      await runOnMaintenanceDatabase(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
    },
  };
}

function migrateDatabase(databaseUrl: string): void {
  const migration = ChildProcess.spawnSync(
    'node',
    ['node_modules/.bin/prisma', 'migrate', 'deploy'],
    {
      cwd: Url.fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf-8',
      env: { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: '1' },
    },
  );

  if (migration.status !== 0) {
    throw new Error(
      `Migrating the acceptance test database failed (exit code ${migration.status}):\n${migration.stdout}${migration.stderr}`,
      { cause: migration.error },
    );
  }
}

async function runOnMaintenanceDatabase(sql: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
  const maintenanceUrl = new URL(ACCEPTANCE_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';

  const client = new Pg.Client({ connectionString: maintenanceUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Could not connect to the acceptance test database server at ${redactedMaintenanceUrl(maintenanceUrl)}: ${describeError(err)}\n` +
      `Is Postgres running (dev/start.sh) and are the credentials right? ` +
      `Another server can be set with APOLLO_ACCEPTANCE_DATABASE_URL.`,
      { cause: err },
    );
  }

  try {
    return (await client.query(sql, values)).rows;
  } catch (err) {
    throw new Error(`Running '${sql}' on the acceptance test database server failed: ${describeError(err)}`, { cause: err });
  } finally {
    await client.end();
  }
}

function databaseName(): string {
  const name = decodeURIComponent(new URL(ACCEPTANCE_DATABASE_URL).pathname.slice(1));
  // The setup drops this database, so a mistyped URL must never point it at a real one
  if (!/_(test|acceptance)$/i.test(name)) {
    throw new Error(`Refusing to use database '${name}' for acceptance tests: its name must end in '_test' or '_acceptance'`);
  }
  return name;
}

function templateDatabaseName(): string {
  return `${databaseName()}_template`;
}

function isolatedDatabaseNamePrefix(): string {
  return `${databaseName()}_isolated_`;
}

function withDatabaseName(name: string): string {
  const url = new URL(ACCEPTANCE_DATABASE_URL);
  url.pathname = `/${encodeURIComponent(name)}`;
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function redactedMaintenanceUrl(maintenanceUrl: URL): string {
  const url = new URL(maintenanceUrl);
  if (url.password !== '') {
    url.password = '***';
  }
  return url.toString();
}

function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map(describeError).join(', ');
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
