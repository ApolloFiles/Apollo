/**
 * Runs once per test run in the main process (Vitest `globalSetup`).
 *
 * Its counterpart is `worker-setup.ts`, which runs in every worker before each test file. Anything expensive that
 * every test file needs the same answer to – like probing what this machine's ffmpeg can do – belongs here and
 * reaches the tests through `inject()`, so it happens once instead of once per file.
 */
import 'reflect-metadata';
import type { TestProject } from 'vitest/node';
import { logFfmpegEnvironment, probeFfmpegEnvironment } from './plugins/ffmpeg/FfmpegTestEnvironment.js';

export default async function setup(project: TestProject): Promise<void> {
  const ffmpegEnvironment = await probeFfmpegEnvironment();

  logFfmpegEnvironment(ffmpegEnvironment);
  project.provide('ffmpegEnvironment', ffmpegEnvironment);
}
