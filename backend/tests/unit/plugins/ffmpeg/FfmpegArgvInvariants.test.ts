import { type Accel, SOFTWARE } from '#src/plugins/official/ffmpeg/accel/Accel.js';
import { createFfmpegDevice } from '#src/plugins/official/ffmpeg/accel/FfmpegDevice.js';
import HwContext, { type HwMode } from '#src/plugins/official/ffmpeg/accel/HwContext.js';
import type { VideoBitDepth } from '#src/plugins/official/ffmpeg/accel/PixelFormatUtil.js';
import type { FfmpegVideoInput } from '#src/plugins/official/ffmpeg/job/FfmpegJob.js';
import type { SubtitleStream, VideoStream } from '#src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';
import { BURN_IN_INPUT } from '#src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/BurnInInputs.js';
import VideoStreamArgumentsBuilder from '#src/plugins/official/media/_old/video-player/live-transcode/ffmpeg/arguments-builder/VideoStreamArgumentsBuilder.js';
import LiveTranscodeLauncher from '#src/plugins/official/media/_old/video-player/live-transcode/launcher/LiveTranscodeLauncher.js';
import SeekThumbnailGenerator from '#src/plugins/official/media/_old/video-player/seek-thumbnails/generator/SeekThumbnailGenerator.js';
import FontExtractor from '#src/plugins/official/media/_old/watch/live_transcode/extractor/FontExtractor.js';
import TextBasedSubtitleExtractor from '#src/plugins/official/media/_old/watch/live_transcode/extractor/TextBasedSubtitleExtractor.js';
import VideoThumbnailFrameExtractor from '#src/plugins/official/media/library/thumbnail/VideoThumbnailFrameExtractor.js';

/**
 * Every job's argv, for every way it can run, checked against the rules the ffmpeg study established – so a caller
 * putting a CPU filter before `hwdownload` or an output option before `-i` fails here and not on someone's GPU.
 */

const DEVICES = [
  createFfmpegDevice('vaapi', '/dev/dri/renderD128', 'intel'),
  createFfmpegDevice('vaapi', '/dev/dri/renderD129', 'amd'),
  createFfmpegDevice('qsv', '/dev/dri/renderD128', 'intel'),
  createFfmpegDevice('cuda', '0', 'nvidia'),
];
const BIT_DEPTHS: VideoBitDepth[] = [8, 10];

const GPU_FILTERS = /^(scale_vaapi|vpp_qsv|scale_cuda|overlay_vaapi|overlay_qsv|overlay_cuda|hwdownload)$/;
const CPU_ONLY_FILTERS = /^(scale|tile|thumbnail|showinfo|overlay)$/;
const INPUT_ONLY_OPTIONS = new Set(['-hwaccel', '-hwaccel_device', '-hwaccel_output_format', '-init_hw_device', '-filter_hw_device', '-skip_frame', '-ss']);
const OUTPUT_ONLY_OPTIONS = new Set(['-vf', '-filter_complex', '-fps_mode', '-frames:v', '-c:v', '-c:s', '-map', '-f', '-an', '-t']);

type Case = {
  readonly name: string;
  readonly build: (accel: Accel, bitDepth: VideoBitDepth) => string[];
  readonly modes: readonly HwMode[];
}

function input(bitDepth: VideoBitDepth): FfmpegVideoInput {
  return { path: '/media/in.mkv', codecName: 'hevc', pixelFormat: bitDepth === 8 ? 'yuv420p' : 'yuv420p10le', width: 3840, height: 2160 };
}

function videoStream(bitDepth: VideoBitDepth, width = 3840): VideoStream {
  return { index: 0, codecType: 'video', codecName: 'hevc', width, height: width * 9 / 16, pixFmt: input(bitDepth).pixelFormat, avgFrameRate: '24000/1001' } as unknown as VideoStream;
}

const SUBTITLE_STREAM = { index: 3, codecType: 'subtitle', codecName: 'hdmv_pgs_subtitle' } as unknown as SubtitleStream;
const EXTRACTED_SUBTITLES = [
  { fileName: 'en.2.ass', streamIndex: 2, title: 'en', language: 'en', codecName: 'ass' },
  { fileName: 'de.3.ass', streamIndex: 3, title: 'de', language: 'de', codecName: 'ass' },
];
const EXTRACTED_FONTS = [{ fileName: 'arial.ttf', streamIndex: 4, byteSize: 512 }, { fileName: 'comic.otf', streamIndex: 5, byteSize: 512 }];
const TARGET = { fps: 23.976, capFrameRate: false, width: 1920, segmentDuration: 2 };

function liveTranscode(accel: Accel, bitDepth: VideoBitDepth, subtitle: SubtitleStream | null, sourceWidth = 3840): string[] {
  const videoArgs = new VideoStreamArgumentsBuilder().build(accel, videoStream(bitDepth, sourceWidth), subtitle, TARGET);
  const burnedInSubtitle = subtitle != null ? { videoStreamIndex: 0, audioStreamCount: 1 } : null;
  const audioMap = `${subtitle != null ? BURN_IN_INPUT.audio(0) : 0}:1`;
  return LiveTranscodeLauncher.buildArgs(accel, '/media/in.mkv', 30, [...videoArgs, '-map', audioMap, '-c:a:0', 'aac'], ['v:0,agroup:audio,name:video', 'a:0,agroup:audio,name:audio_1'], TARGET, burnedInSubtitle);
}

const CASES: Case[] = [
  { name: 'seek thumbnails', build: (accel, bitDepth) => SeekThumbnailGenerator.buildArgs(accel, input(bitDepth)), modes: ['fullChain'] },
  { name: 'poster candidates', build: (accel, bitDepth) => VideoThumbnailFrameExtractor.buildArgs(accel, input(bitDepth), 120), modes: ['fullChain'] },
  { name: 'live transcode', build: (accel, bitDepth) => liveTranscode(accel, bitDepth, null), modes: ['fullChain', 'encodeOnly'] },
  { name: 'live transcode without scaling', build: (accel, bitDepth) => liveTranscode(accel, bitDepth, null, 1920), modes: ['fullChain', 'encodeOnly'] },
  { name: 'live transcode with burned-in subtitle', build: (accel, bitDepth) => liveTranscode(accel, bitDepth, SUBTITLE_STREAM), modes: ['fullChain', 'encodeOnly'] },
  { name: 'live transcode with burned-in subtitle, without scaling', build: (accel, bitDepth) => liveTranscode(accel, bitDepth, SUBTITLE_STREAM, 1920), modes: ['fullChain', 'encodeOnly'] },
  { name: 'text-based subtitle extraction', build: () => TextBasedSubtitleExtractor.buildArgs('/media/in.mkv', '/tmp/subtitles', EXTRACTED_SUBTITLES), modes: [] },
  { name: 'subtitle font extraction', build: () => FontExtractor.buildArgs('/media/in.mkv', '/tmp/subtitles/fonts', EXTRACTED_FONTS), modes: [] },
];

function accelsFor(testCase: Case, bitDepth: VideoBitDepth): Accel[] {
  const accels: Accel[] = [SOFTWARE];
  for (const device of DEVICES) {
    for (const mode of testCase.modes) {
      accels.push(new HwContext(device, mode, bitDepth));
    }
  }
  return accels;
}

function filterGraph(args: string[]): string | null {
  const graphIndex = args.findIndex((arg) => arg === '-vf' || arg === '-filter_complex');
  return graphIndex === -1 ? null : args[graphIndex + 1];
}

type GraphSegment = {
  readonly inputLabels: string[];
  /** Filter names in chain order */
  readonly filters: string[];
  readonly outputLabel: string | null;
}

/** `[in1][in2]filter=a,filter2[out]` per `;`-separated segment; a plain `-vf` chain is one segment without labels */
function parseGraph(graph: string): GraphSegment[] {
  return graph.split(';').map((segment) => {
    const inputLabels = [...segment.matchAll(/^(\[[^\]]*])+/g)].flatMap((match) => match[0].match(/\[[^\]]*]/g) ?? []);
    const outputLabel = /(\[[^\]]*])$/.exec(segment.slice(inputLabels.join('').length))?.[1] ?? null;
    const chain = segment.slice(inputLabels.join('').length, outputLabel == null ? undefined : -outputLabel.length);
    return { inputLabels, filters: chain.split(',').map((filter) => filter.split('=')[0].trim()).filter((filter) => filter !== ''), outputLabel };
  });
}

/** Decoded video frames start where the accel put them; anything else fed into the graph (a subtitle canvas) starts in system memory */
function initialFrameLocation(inputLabel: string | null, accel: Accel): boolean {
  const decodedVideo = inputLabel == null || /^\[\d+:0]$/.test(inputLabel);
  return decodedVideo && accel.framesOnGpu;
}

/** Walks every chain of the graph and returns where the frames of the final output are */
function verifyFrameLocations(graph: string, accel: Accel): boolean {
  const locationByLabel = new Map<string, boolean>();
  let lastLocation = false;

  for (const segment of parseGraph(graph)) {
    const firstInput = segment.inputLabels[0] ?? null;
    let framesOnGpu = firstInput != null && locationByLabel.has(firstInput) ? locationByLabel.get(firstInput)! : initialFrameLocation(firstInput, accel);

    for (const filter of segment.filters) {
      if (filter === 'hwdownload') {
        expect(framesOnGpu, `${filter} without frames on the device in ${graph}`).toBe(true);
        framesOnGpu = false;
      } else if (filter === 'hwupload' || filter === 'hwupload_cuda') {
        framesOnGpu = true;
      } else if (GPU_FILTERS.test(filter)) {
        expect(framesOnGpu, `${filter} with frames in system memory in ${graph}`).toBe(true);
      } else if (CPU_ONLY_FILTERS.test(filter)) {
        expect(framesOnGpu, `${filter} with frames on the device in ${graph}`).toBe(false);
      }
    }

    if (segment.outputLabel != null) {
      locationByLabel.set(segment.outputLabel, framesOnGpu);
    }
    lastLocation = framesOnGpu;
  }
  return lastLocation;
}

/** The options in front of each `-i`, then those after the last one */
function optionGroups(args: string[]): { inputOptions: string[][], outputOptions: string[] } {
  const inputOptions: string[][] = [];
  let group: string[] = [];
  for (const arg of args) {
    if (arg === '-i') {
      inputOptions.push(group);
      group = [];
    } else if (arg.startsWith('-')) {
      group.push(arg);
    }
  }
  return { inputOptions, outputOptions: group };
}

type Run = {
  readonly accelId: string;
  readonly accel: Accel;
  readonly bitDepth: VideoBitDepth;
  readonly args: string[];
  readonly graph: string | null;
  /** `null` when the job leaves the choice to ffmpeg, which picks an image encoder for its image outputs */
  readonly encoder: string | null;
}

type BuildAttempt = {
  readonly accelId: string;
  readonly run: Run | null;
  readonly buildError: unknown;
}

type GraphRun = Run & { readonly graph: string };
type HwRun = Run & { readonly accel: HwContext };

const FRAMES_ON_GPU_BY_ENCODER = new Map([['h264_vaapi', true], ['libx264', false], ['png', false]]);
const EIGHT_BIT_ENCODERS = new Set(['h264_nvenc', 'h264_qsv', 'h264_vaapi', 'libx264']);

/** Builds while tests are collected, so a throwing builder becomes a failing row instead of a broken file */
function buildAttemptsOf(testCase: Case, bitDepth: VideoBitDepth): BuildAttempt[] {
  return accelsFor(testCase, bitDepth).map((accel) => {
    try {
      const args = testCase.build(accel, bitDepth);
      const encoder = args.includes('-c:v') ? args[args.indexOf('-c:v') + 1] : null;
      return { accelId: accel.id, run: { accelId: accel.id, accel, bitDepth, args, graph: filterGraph(args), encoder }, buildError: null };
    } catch (error) {
      return { accelId: accel.id, run: null, buildError: error };
    }
  });
}

function hasGraph(run: Run): run is GraphRun {
  return run.graph != null;
}

function isHw(run: Run): run is HwRun {
  return run.accel instanceof HwContext;
}

describe('FFmpeg argv invariants', () => {
  describe.for(CASES)('$name', (testCase) => {
    describe.for(BIT_DEPTHS.map((bitDepth) => ({ bitDepth })))('$bitDepth-bit input', ({ bitDepth }) => {
      const buildAttempts = buildAttemptsOf(testCase, bitDepth);
      const runs = buildAttempts.flatMap((attempt) => attempt.run ?? []);
      const graphRuns = runs.filter(hasGraph);
      const hwRuns = runs.filter(isHw);

      test.for(buildAttempts)('Builds its arguments on $accelId', ({ buildError }) => {
        expect(buildError).toBeNull();
      });

      test.for(runs)('Keeps input options before -i and output options after it on $accelId', ({ args }) => {
        const { inputOptions, outputOptions } = optionGroups(args);

        expect(inputOptions.length).toBeGreaterThan(0);
        expect(inputOptions.flat().filter((option) => OUTPUT_ONLY_OPTIONS.has(option)), 'output options before -i').toEqual([]);
        expect(outputOptions.filter((option) => INPUT_ONLY_OPTIONS.has(option)), 'input options after -i').toEqual([]);
      });

      test.for(graphRuns)('Runs every filter where its frames are on $accelId', ({ graph, accel }) => {
        verifyFrameLocations(graph, accel);
      });

      test.for(graphRuns.filter((run) => run.encoder != null && FRAMES_ON_GPU_BY_ENCODER.has(run.encoder)))('Hands $encoder its frames where it takes them on $accelId', ({ graph, accel, encoder }) => {
        const framesOnGpu = verifyFrameLocations(graph, accel);

        expect(framesOnGpu, `${encoder} fed frames from the wrong memory in ${graph}`).toBe(FRAMES_ON_GPU_BY_ENCODER.get(encoder!));
      });

      test.for(graphRuns.filter((run) => run.encoder == null))('Hands the default image encoder frames in system memory on $accelId', ({ graph, accel }) => {
        const framesOnGpu = verifyFrameLocations(graph, accel);

        expect(framesOnGpu, `image encoder fed frames from the device in ${graph}`).toBe(false);
      });

      test.for(graphRuns)('Uses only the verified filter spellings on $accelId', ({ graph }) => {
        const filters = parseGraph(graph).flatMap((segment) => segment.filters);

        expect(filters, `pointless pass-through filter in ${graph}`).not.toContain('null');
        expect(graph).not.toMatch(/vpp_qsv=[^,;]*h=-2/);
        expect(graph).not.toMatch(/hwdownload(?!,format=)/);
        expect(graph).not.toMatch(/format=(nv12|yuv420p)[^;]*\]?[^;]*overlay_(vaapi|qsv|cuda)/);
      });

      test.for(hwRuns)('Initialises the device and names it for the filters on $accelId', ({ args }) => {
        expect(args).toContain('-init_hw_device');
        expect(args).toContain('-filter_hw_device');
      });

      test.for(hwRuns.filter((run) => run.accel.mode === 'fullChain'))('Asks the decoder for device frames on $accelId', ({ args }) => {
        expect(args).toContain('-hwaccel_output_format');
      });

      test.for(runs.filter((run) => run.bitDepth === 10 && run.encoder != null && EIGHT_BIT_ENCODERS.has(run.encoder)))('Converts to 8 bit for $encoder on $accelId', ({ graph, encoder }) => {
        expect(graph, `${encoder} would see 10-bit frames`).toMatch(/format=(nv12|yuv420p)/);
      });
    });
  });

  describe('live transcode burned-in subtitle', () => {
    const INTEL_VAAPI = new HwContext(DEVICES[0], 'fullChain', 8);
    const CUDA = new HwContext(DEVICES[3], 'fullChain', 8);

    function subtitleChain(args: string[]): string {
      const graph = filterGraph(args) ?? '';
      return graph.split(';').find((segment) => segment.startsWith(`[0:${SUBTITLE_STREAM.index}]`)) ?? '';
    }

    test.for([
      { accel: SOFTWARE, sourceWidth: 3840, expected: '[0:3]scale=1920:1080[v1]' },
      { accel: INTEL_VAAPI, sourceWidth: 3840, expected: '[0:3]scale=1920:1080,format=rgba,hwupload[v1]' },
      { accel: CUDA, sourceWidth: 3840, expected: '[0:3]scale=1920:1080[v1]' },
      { accel: SOFTWARE, sourceWidth: 1920, expected: '[0:3]scale=1920:1080[v0]' },
    ])('Sizes the subtitle canvas to the output video on $accel.id with a $sourceWidth px wide source', ({ accel, sourceWidth, expected }) => {
      expect(subtitleChain(liveTranscode(accel, 8, SUBTITLE_STREAM, sourceWidth))).toBe(expected);
    });
  });

  describe('live transcode frame rate', () => {
    test('Caps the encoder frame rate, with a matching closed GOP, when the source runs faster than the target', () => {
      const args = new VideoStreamArgumentsBuilder().build(SOFTWARE, videoStream(8), null, { ...TARGET, fps: 60, capFrameRate: true });

      expect(args.slice(args.indexOf('-r'), args.indexOf('-r') + 2)).toEqual(['-r', '60']);
      expect(args[args.indexOf('-g') + 1]).toBe('120');
      expect(args[args.indexOf('-flags:v') + 1]).toBe('+cgop');
    });

    test('Leaves the encoder frame rate alone when the source does not run faster than the target', () => {
      const args = new VideoStreamArgumentsBuilder().build(SOFTWARE, videoStream(8), null, TARGET);

      expect(args).not.toContain('-r');
    });
  });
});
