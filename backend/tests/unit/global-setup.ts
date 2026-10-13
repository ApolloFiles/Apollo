/**
 * Runs once per unit test run in the main process (Vitest `globalSetup`).
 *
 * Unit tests must mock everything that resolves Apollo's directories, so the data directory they are given is never
 * created – unless one of them reaches the real file system, which the teardown reports.
 */
import Fs from 'node:fs';
import Path from 'node:path';
import type { TestProject } from 'vitest/node';
import { VITEST_ROOT_DIRECTORY } from '#tests/test-constants.js';
import { removeVitestRootDirectoryIfEmpty } from '#tests/test-helpers.js';

export const UNIT_TEST_UNUSED_DATA_DIRECTORY = Path.join(VITEST_ROOT_DIRECTORY, 'unit-test-unused-data-dir');
const UNIT_TEST_TEMPORARY_DIRECTORY_ROOT = Path.join(VITEST_ROOT_DIRECTORY, 'unit-test-tmp');

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  await removeRunDirectories();
  await Fs.promises.mkdir(UNIT_TEST_TEMPORARY_DIRECTORY_ROOT, { recursive: true });
  project.provide('temporaryTestDirectoryRoot', UNIT_TEST_TEMPORARY_DIRECTORY_ROOT);

  return async () => {
    const wasCreated = Fs.existsSync(UNIT_TEST_UNUSED_DATA_DIRECTORY);
    await removeRunDirectories();

    if (wasCreated) {
      throw new Error(`A unit test created '${UNIT_TEST_UNUSED_DATA_DIRECTORY}' – it reached the real file system through Apollo's directories instead of a mock`);
    }
  };
}

async function removeRunDirectories(): Promise<void> {
  await Fs.promises.rm(UNIT_TEST_UNUSED_DATA_DIRECTORY, { recursive: true, force: true });
  await Fs.promises.rm(UNIT_TEST_TEMPORARY_DIRECTORY_ROOT, { recursive: true, force: true });
  await removeVitestRootDirectoryIfEmpty();
}
