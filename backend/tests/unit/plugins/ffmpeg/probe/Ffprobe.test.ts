import type { MockInstance } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import type { FfprobeExecutor } from '#src/plugins/official/ffmpeg/probe/FfprobeExecutor.js';
import { FfprobeResultParser } from '#src/plugins/official/ffmpeg/probe/FfprobeResultParser.js';
import { Ffprobe } from '#src/plugins/official/ffmpeg/probe/Ffprobe.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import { ARRIVAL_PATH, arrivalFormat, arrivalFullProbe } from './FfprobeOutputs.js';

describe(Ffprobe, () => {
  let executor: DeepMockProxy<FfprobeExecutor>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let ffprobe: Ffprobe;

  beforeEach(() => {
    const fullProbesByPath = new Map([[ARRIVAL_PATH, arrivalFullProbe()]]);
    executor = createStrictDeepMock<FfprobeExecutor>();
    executor.probeFull.mockImplementation(async (filePath) => fullProbesByPath.get(filePath)!);
    executor.probeFormat.mockImplementation(async (filePath) => ({ format: fullProbesByPath.get(filePath)!.format }));
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    ffprobe = new Ffprobe(executor, new FfprobeResultParser());
  });

  test('Returns the normalized full probe of the file', async () => {
    const probe = await ffprobe.probeFull(ARRIVAL_PATH);

    expect(probe.streams.map((stream) => stream.disposition.dub)).toEqual([false, true]);
    expect(probe.format.tags).toEqual({ title: 'Arrival', ENCODER: 'Lavf61.7.100' });
  });

  test('Returns the format of the file for a format probe', async () => {
    const probe = await ffprobe.probeFormat(ARRIVAL_PATH);

    expect(probe.format.duration).toBe('6967.103000');
  });

  test('Probes the file again on every call', async () => {
    await ffprobe.probeFull(ARRIVAL_PATH);
    await ffprobe.probeFull(ARRIVAL_PATH);

    expect(executor.probeFull).toHaveBeenCalledTimes(2);
  });

  test('Warns about keys the schema does not know yet, naming the file', async () => {
    executor.probeFull.mockResolvedValue({ ...arrivalFullProbe(), programs: [] });

    await ffprobe.probeFull(ARRIVAL_PATH);

    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(ARRIVAL_PATH));
  });

  test('Rejects output that does not match the schema', async () => {
    executor.probeFull.mockResolvedValue({ format: arrivalFormat() });

    await expect(ffprobe.probeFull(ARRIVAL_PATH)).rejects.toThrow(ZodError);
  });
});
