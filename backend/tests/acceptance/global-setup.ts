/**
 * Runs once per test run in the main process (Vitest `globalSetup`).
 *
 * Its counterpart is `worker-setup.ts`, which runs in every worker before each test file. Anything expensive that
 * every test file needs the same answer to – like probing what this machine's ffmpeg can do – belongs here and
 * reaches the tests through `inject()`, so it happens once instead of once per file.
 */
import 'reflect-metadata';
import type { TestProject } from 'vitest/node';
import {
  ACCEPTANCE_ENV,
  ACCEPTANCE_TEMPORARY_TEST_DIRECTORY_ROOT,
  recreateAcceptanceEnvironment,
  removeAcceptanceEnvironment,
} from './AcceptanceTestEnvironment.js';
import { logFfmpegEnvironment, probeFfmpegEnvironment } from './plugins/ffmpeg/FfmpegTestEnvironment.js';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  await recreateAcceptanceEnvironment();
  Object.assign(process.env, ACCEPTANCE_ENV);
  project.provide('temporaryTestDirectoryRoot', ACCEPTANCE_TEMPORARY_TEST_DIRECTORY_ROOT);

  const ffmpegEnvironment = await probeFfmpegEnvironment();

  logFfmpegEnvironment(ffmpegEnvironment);
  project.provide('ffmpegEnvironment', ffmpegEnvironment);

  console.log('');  // empty line

  return async () => {
    await removeAcceptanceEnvironment();
  };
}
