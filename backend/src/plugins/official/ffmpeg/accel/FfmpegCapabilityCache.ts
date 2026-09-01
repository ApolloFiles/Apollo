import { singleton } from 'tsyringe';
import FfmpegProcessRunner from '../process/FfmpegProcessRunner.js';
import type { FfmpegDevice } from './FfmpegDevice.js';
import HwContext, { type HwVideoCodec } from './HwContext.js';
import type { VideoBitDepth } from './PixelFormatUtil.js';

export type DecodeProbeInput = {
  readonly path: string;
  readonly codecName: string;
  readonly bitDepth: VideoBitDepth;
  readonly width: number;
  readonly height: number;
}

type CachedAnswer = {
  readonly usable: boolean;
  readonly expiresAt: number | null;
}

type PendingProbe = {
  readonly promise: Promise<boolean>;
  /** Lets a probe that was forgotten while still running tell that its result is not wanted any more */
  readonly token: object;
}

/**
 * Whether a device can decode a given codec at a given bit depth, or encode a given codec – learned by running one
 * frame through it, because nothing short of that is reliable: `vainfo` does not know about resolution limits, and
 * a VAAPI decoder that cannot handle the profile silently continues in software unless the output format pins it.
 *
 * Decoding is probed on the job's own input file with the frame forced through the device, so that silent fallback
 * turns into the hard failure it should be, and remembered per codec, bit depth and resolution – a device that decodes
 * 1080p HEVC has not thereby shown it decodes 8K. Encoding is probed with frames uploaded the way the real job
 * uploads them, which – unlike feeding the encoder software frames – is a test `h264_vaapi` can pass; its output
 * size is not known here, so an encoder rejecting a huge output still surfaces as a fast init-time failure of the job.
 *
 * Yes stays for the process lifetime; no expires, so a GPU that shows up later (driver loaded, device attached)
 * gets another chance without a restart.
 */
@singleton()
export default class FfmpegCapabilityCache {
  private static readonly PROBE_TIMEOUT_IN_MILLIS = 15_000;
  private static readonly NEGATIVE_ANSWER_TTL_IN_MILLIS = 10 * 60_000;

  private readonly answers = new Map<string, CachedAnswer>();
  private readonly pendingProbes = new Map<string, PendingProbe>();

  constructor(
    private readonly ffmpegProcessRunner: FfmpegProcessRunner,
  ) {
  }

  canDecode(device: FfmpegDevice, input: DecodeProbeInput): Promise<boolean> {
    const key = `${device.id}|decode|${input.codecName}|${input.bitDepth}|${input.width}x${input.height}`;
    return this.answer(key, () => this.probeDecoding(device, input));
  }

  canEncode(device: FfmpegDevice, codec: HwVideoCodec): Promise<boolean> {
    const key = `${device.id}|encode|${codec}`;
    return this.answer(key, () => this.probeEncoding(device, codec));
  }

  /**
   * Drops every answer about a device, for when a real job found it broken although its probes passed – a yes never
   * expires on its own, so this is what gets the device probed again (and, if it is still broken, kept out for a while).
   */
  forgetDevice(device: FfmpegDevice): void {
    for (const key of [...this.answers.keys(), ...this.pendingProbes.keys()]) {
      if (key.startsWith(`${device.id}|`)) {
        this.answers.delete(key);
        this.pendingProbes.delete(key);
      }
    }
  }

  private answer(key: string, probe: () => Promise<boolean>): Promise<boolean> {
    const cachedAnswer = this.answers.get(key);
    if (cachedAnswer != null && (cachedAnswer.expiresAt == null || performance.now() < cachedAnswer.expiresAt)) {
      return Promise.resolve(cachedAnswer.usable);
    }

    const pendingProbe = this.pendingProbes.get(key);
    if (pendingProbe != null) {
      return pendingProbe.promise;
    }

    const token = {};
    const promise = probe().then((usable) => {
      if (this.pendingProbes.get(key)?.token === token) {
        this.pendingProbes.delete(key);
        this.answers.set(key, {
          usable,
          expiresAt: usable ? null : performance.now() + FfmpegCapabilityCache.NEGATIVE_ANSWER_TTL_IN_MILLIS,
        });
      }
      return usable;
    });
    promise.catch(() => {
      if (this.pendingProbes.get(key)?.token === token) {
        this.pendingProbes.delete(key);
      }
    });
    this.pendingProbes.set(key, { promise, token });
    return promise;
  }

  /**
   * The frame is pulled back off the device before the null muxer sees it: a decoder that quietly continued in
   * software leaves nothing on the device to download, and the graph fails instead of the probe passing.
   */
  private async probeDecoding(device: FfmpegDevice, input: DecodeProbeInput): Promise<boolean> {
    const hwContext = new HwContext(device, 'fullChain', input.bitDepth);
    return this.runProbe(`decode ${input.codecName} (${input.bitDepth}-bit, ${input.width}x${input.height}) on '${device.id}'`, [
      ...hwContext.inputArgs(),
      '-i', input.path,
      '-map', '0:V:0',
      '-vf', hwContext.download().join(','),
      '-frames:v', '1',
      '-f', 'null', '-',
    ]);
  }

  private async probeEncoding(device: FfmpegDevice, codec: HwVideoCodec): Promise<boolean> {
    const hwContext = new HwContext(device, 'encodeOnly', 8);
    return this.runProbe(`encode ${codec} on '${device.id}'`, [
      ...hwContext.inputArgs(),
      '-f', 'lavfi',
      '-i', 'color=c=black:s=320x240:r=25',
      '-frames:v', '1',
      '-vf', hwContext.encoderInput().join(','),
      ...hwContext.encoder(codec, { quality: 26 }),
      '-f', 'null', '-',
    ]);
  }

  private async runProbe(description: string, args: string[]): Promise<boolean> {
    const handle = this.ffmpegProcessRunner.spawn(args, {
      logVerbosity: 'warning',
      timeoutInMillis: FfmpegCapabilityCache.PROBE_TIMEOUT_IN_MILLIS,
    });

    const exitResult = await handle.waitForExit();
    const usable = exitResult.exitCode === 0;
    if (!usable) {
      console.debug(`[DEBUG] FFmpeg cannot ${description} (exitCode=${exitResult.exitCode}, signal=${exitResult.signal}):\n${handle.getLogProblems()}`);
    }
    return usable;
  }
}
