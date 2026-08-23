import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { container } from 'tsyringe';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FfmpegLogLine } from '../../../../src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';
import FfmpegProcessRunner from '../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import type { FfmpegProgress } from '../../../../src/plugins/official/ffmpeg/process/FfmpegProgressParser.js';
import { requireFfmpeg } from './FfmpegTestEnvironment.js';

/** Generates video without needing any encoder to be available. */
const ONE_SECOND_OF_VIDEO = ['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25', '-t', '1', '-f', 'null', '-'];
const ENDLESS_VIDEO = ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25', '-f', 'null', '-'];

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-ffmpeg-acceptance-'));
});

afterAll(async () => {
  await Fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('FfmpegProcessRunner log output', () => {
  test('Parses the level and the component out of what ffmpeg really writes', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ONE_SECOND_OF_VIDEO);

    const logLines: FfmpegLogLine[] = [];
    handle.on('log', (logLine) => logLines.push(logLine));
    await handle.waitForExit();

    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.some((logLine) => logLine.level === 'info')).toBe(true);
    expect(logLines.some((logLine) => logLine.component != null)).toBe(true);
    expect(logLines.every((logLine) => logLine.message.length > 0)).toBe(true);
  });

  test('Does not let the periodic stats output leak into the log', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ONE_SECOND_OF_VIDEO);

    await handle.waitForExit();

    expect(handle.getLogTail()).not.toContain('\r');
  });

  test('Reports why a run failed', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(['-i', '/does/not/exist.mkv', '-f', 'null', '-']);

    const exitResult = await handle.waitForExit();

    expect(exitResult.exitCode).not.toBe(0);
    expect(handle.getLogProblems()).toContain('/does/not/exist.mkv');
  });

  test('Collects the full log only when asked to', async (ctx) => {
    requireFfmpeg(ctx);
    const ffmpegProcessRunner = container.resolve(FfmpegProcessRunner);

    const withoutFullLog = ffmpegProcessRunner.spawn(ONE_SECOND_OF_VIDEO);
    const withFullLog = ffmpegProcessRunner.spawn(ONE_SECOND_OF_VIDEO, { captureFullLog: true });
    await Promise.all([withoutFullLog.waitForExit(), withFullLog.waitForExit()]);

    expect(withoutFullLog.getFullLog()).toBeNull();
    expect(withFullLog.getFullLog()?.length).toBeGreaterThan(withFullLog.getLogTail().length - 1);
  });
});

describe('FfmpegProcessRunner progress reporting', () => {
  test('Reports progress in the format our parser expects', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ONE_SECOND_OF_VIDEO, { progressPeriodInSeconds: 0.1 });

    const progressUpdates: FfmpegProgress[] = [];
    handle.on('progress', (progress) => progressUpdates.push(progress));
    await handle.waitForExit();

    expect(progressUpdates.length).toBeGreaterThan(0);

    const lastProgress = progressUpdates.at(-1)!;
    expect(lastProgress.finished).toBe(true);
    expect(lastProgress.frame).toBe(25);
    expect(lastProgress.outTimeInMillis).toBeGreaterThan(900);
    expect(lastProgress.outTimeInMillis).toBeLessThan(1_100);
    expect(lastProgress.speed).toBeGreaterThan(0);
  });

  test('Keeps reporting progress while a long run is going on', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ENDLESS_VIDEO, { progressPeriodInSeconds: 0.1 });

    const progressUpdates: FfmpegProgress[] = [];
    handle.on('progress', (progress) => progressUpdates.push(progress));
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await handle.kill();

    expect(progressUpdates.length).toBeGreaterThan(1);
    expect(progressUpdates.at(-1)!.outTimeInMillis!).toBeGreaterThan(progressUpdates[0].outTimeInMillis!);
    expect(handle.getStats().peakFps).not.toBeNull();
  });
});

describe('FfmpegProcessRunner process control', () => {
  test('Writes its output into the given working directory', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn([
      '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25',
      '-frames:v', '1',
      '-c:v', 'png',
      'frame.png',
    ], { cwd: tmpDir });

    expect(await handle.waitForExit()).toMatchObject({ exitCode: 0 });
    expect((await Fs.promises.stat(Path.join(tmpDir, 'frame.png'))).size).toBeGreaterThan(0);
  });

  test('Captures stdout when asked to', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(['-hwaccels'], { captureStdout: true });

    expect(await handle.waitForExit()).toMatchObject({ exitCode: 0 });
    expect(handle.getStdout().trim().length).toBeGreaterThan(0);
  });

  test('Lets a long running process finish what it is doing on shutdown', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ENDLESS_VIDEO, { progressPeriodInSeconds: 0.1 });

    await new Promise<void>((resolve) => handle.once('progress', () => resolve()));
    const exitResult = await handle.shutdown(5_000);

    expect(exitResult.signal).not.toBe('SIGKILL');
    expect(handle.hasExited()).toBe(true);
  });

  test('Force-kills a process that outlives its timeout', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(ENDLESS_VIDEO, { timeoutInMillis: 500 });

    expect(await handle.waitForExit()).toMatchObject({ exitCode: null, signal: 'SIGKILL' });
  });

  test('Resolves instead of rejecting when ffmpeg exits non-zero', async (ctx) => {
    requireFfmpeg(ctx);
    const handle = container.resolve(FfmpegProcessRunner).spawn(['-definitely-not-an-option']);

    await expect(handle.waitForExit()).resolves.toMatchObject({ signal: null });
    expect(handle.getExitResult()?.exitCode).not.toBe(0);
  });
});
