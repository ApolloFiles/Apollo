import { describe, expect, test } from 'vitest';
import FfmpegFailureClassifier from '../../../../../src/plugins/official/ffmpeg/job/FfmpegFailureClassifier.js';
import UnretryableFfmpegJobError from '../../../../../src/plugins/official/ffmpeg/job/UnretryableFfmpegJobError.js';
import FfmpegHandle from '../../../../../src/plugins/official/ffmpeg/process/FfmpegHandle.js';
import FakeChildProcess, { flushStreams } from '../process/FakeChildProcess.js';

async function classify(logLines: string[], exitCode = 1, error: unknown = new Error('attempt failed')) {
  const childProcess = new FakeChildProcess();
  const handle = new FfmpegHandle(childProcess.asChildProcess(), [], { captureFullLog: false, captureStdout: false });
  const classifier = FfmpegFailureClassifier.observe(handle);

  for (const logLine of logLines) {
    childProcess.stderr.write(`${logLine}\n`);
  }
  await flushStreams();
  childProcess.simulateClose(exitCode);
  await handle.waitForExit();

  return { failure: classifier.classify(handle.getExitResult(), error), classifier };
}

describe('FfmpegFailureClassifier#classify', () => {
  test('A missing driver library is a device failure worth retrying elsewhere', async () => {
    const { failure } = await classify([
      '[AVHWDeviceContext @ 0x55a6] [error] Cannot load libcuda.so.1',
      '[error] Device creation failed: -1.',
      '[fatal] Error parsing global options: Operation not permitted',
    ], 255);

    expect(failure).toMatchObject({ kind: 'device', retryable: true });
  });

  test('A missing input file is not retryable, whatever else was logged', async () => {
    const { failure } = await classify([
      '[in#0 @ 0x5586] [error] Error opening input: No such file or directory',
      '[error] Error opening input file /does/not/exist.mkv.',
      '[vist#0:0/h264 @ 0x1] [error] Hardware device setup failed for decoder: Operation not permitted',
    ], 254);

    expect(failure).toMatchObject({ kind: 'input', retryable: false });
  });

  test('Does not mistake a thread dying of invalid data for an unreadable input', async () => {
    const { failure } = await classify([
      '[hevc @ 0x1] [error] Failed setup for format vaapi: hwaccel initialisation returned error.',
      '[vist#0:0/hevc @ 0x1] [error] Task finished with error code: -1094995529 (Invalid data found when processing input)',
    ], 69);

    expect(failure).toMatchObject({ kind: 'decoder', retryable: true });
  });

  test('Refusing to overwrite the output is not retryable', async () => {
    const { failure } = await classify([`[fatal] File 'out.mp4' already exists. Exiting.`]);

    expect(failure).toMatchObject({ kind: 'output', retryable: false });
  });

  test('A file mentioned by a warning does not count', async () => {
    const { failure } = await classify([
      '[warning] Failed to open /usr/share/fonts/whatever.ttf: No such file or directory',
      '[error] No device available for decoder: device type cuda needed for codec h264.',
    ], 255);

    expect(failure).toMatchObject({ kind: 'device', retryable: true });
  });

  test('Tells decoder, encoder and graph failures apart', async () => {
    expect((await classify(['[av1 @ 0x1] [error] Failed setup for format vaapi: hwaccel initialisation returned error.'], 69)).failure.kind).toBe('decoder');
    expect((await classify(['[h264_nvenc @ 0x1] [error] 10 bit encode not supported'], 218)).failure.kind).toBe('encoder');
    expect((await classify(['[error] Impossible to convert between the formats supported by the filter \'graph -1 input from stream 0:0\' and the filter \'auto_scale_0\''], 218)).failure.kind).toBe('graph');
    expect((await classify(['[error] Reconfiguring filter graph because video parameters changed to yuv420p10le, hwaccel changed'], 218)).failure.kind).toBe('mid-stream');
  });

  test('Anything unrecognised is retryable, which costs a process at worst', async () => {
    const { failure } = await classify(['[error] Something odd happened'], 1);

    expect(failure).toMatchObject({ kind: 'unknown', retryable: true });
  });

  test('A job that gave up on its own is not retried', async () => {
    const { failure } = await classify([], 0, new UnretryableFfmpegJobError('waited long enough'));

    expect(failure).toMatchObject({ kind: 'aborted', retryable: false, message: 'waited long enough' });
  });

  test('NVDEC rejecting one file is the decoder, not a broken device', async () => {
    const { failure } = await classify([
      '[h264 @ 0x1] [error] decoder->cvdl->cuvidCreateDecoder(&decoder->decoder, params) failed -> CUDA_ERROR_INVALID_VALUE: invalid argument',
      '[h264 @ 0x1] [warning] Using more than 32 (36) decode surfaces might cause nvdec to fail.',
      '[h264 @ 0x1] [warning] Try lowering the amount of threads. Using 13 right now.',
      '[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.',
      `[error] Impossible to convert between the formats supported by the filter 'graph 0 input from stream 0:0' and the filter 'auto_scale_1'`,
      '[vf#0:0 @ 0x1] [error] Error reinitializing filters!',
      '[error] Error while filtering: Function not implemented',
    ], 218);

    expect(failure).toMatchObject({ kind: 'decoder', retryable: true });
  });

  test('A CUDA error while creating the device is still a device failure', async () => {
    const { failure } = await classify([
      '[AVHWDeviceContext @ 0x1] [error] cu->cuInit(0) failed -> CUDA_ERROR_NO_DEVICE: no CUDA-capable device is detected',
    ], 255);

    expect(failure).toMatchObject({ kind: 'device', retryable: true });
  });

  test('A stream changing under a running pipeline outranks the decoder error it drags behind it', async () => {
    const { failure } = await classify([
      '[error] Reconfiguring filter graph because video parameters changed to yuv420p10le, hwaccel changed',
      '[h264 @ 0x1] [error] Failed setup for format cuda: hwaccel initialisation returned error.',
    ], 218);

    expect(failure).toMatchObject({ kind: 'mid-stream', retryable: true });
  });

  test('An input whose format never becomes known is not worth another device', async () => {
    const { failure } = await classify([
      '[matroska,webm @ 0x1] [warning] Could not find codec parameters for stream 0 (Video: mpeg4 (Advanced Simple Profile), none, 640x480): unspecified pixel format',
      '[error] Cannot determine format of input stream 0:0 after EOF',
      '[fatal] Error marking filters as finished',
      '[error] Error while filtering: Invalid data found when processing input',
    ], 183);

    expect(failure).toMatchObject({ kind: 'input', retryable: false });
  });

  test('Notices a decoder silently continuing in software', async () => {
    const { classifier } = await classify(['[h264 @ 0x1] [error] Failed setup for format vaapi: hwaccel initialisation returned error.'], 0);

    expect(classifier.silentlyFellBackToSoftware).toBe(true);
  });
});
