import type { default as FfmpegHandle, FfmpegExitResult } from '../process/FfmpegHandle.js';
import type { FfmpegLogLine } from '../process/FfmpegLogLineParser.js';
import UnretryableFfmpegJobError from './UnretryableFfmpegJobError.js';

export type FfmpegFailureKind =
  /** The input cannot be read – no device is going to change that */
  | 'input'
  /** The output cannot be written – no device is going to change that */
  | 'output'
  /** The job itself ruled out another attempt */
  | 'aborted'
  /** The device could not be created or opened at all – worth quarantining */
  | 'device'
  | 'decoder'
  | 'encoder'
  /** Frames could not be passed between two filters, typically a hardware frame reaching a CPU filter */
  | 'graph'
  /** The stream changed under a running pipeline */
  | 'mid-stream'
  | 'unknown';

export type FfmpegFailure = {
  readonly kind: FfmpegFailureKind;
  readonly retryable: boolean;
  readonly message: string;
}

type Pattern = {
  readonly kind: FfmpegFailureKind;
  readonly regex: RegExp;
}

/**
 * Turns an attempt's exit into what a runner can act on: try the next device, quarantine this one, or give up.
 *
 * FFmpeg's exit code alone does not carry that (a VAAPI decoder that cannot handle the profile keeps going in software
 * and exits 0; a missing input and a missing driver library both exit 255), so the lines it logs are matched against
 * the messages seen for each failure class on real hardware. Every line is watched as it arrives, because the handle
 * only keeps the last few problem lines and a chatty run pushes the decisive one out.
 */
export default class FfmpegFailureClassifier {
  private static readonly SILENT_SOFTWARE_FALLBACK = /Failed setup for format/;

  /**
   * Earlier entries win: a missing input also drags a decoder error behind it, and it is the input that matters.
   * A kind may appear more than once, for a line specific enough to outrank a generic diagnosis above it.
   */
  private static readonly PATTERNS: readonly Pattern[] = [
    { kind: 'input', regex: /Error opening input/ },
    { kind: 'output', regex: /already exists\. Exiting|Error opening output|Could not write header|Error writing trailer/ },
    { kind: 'device', regex: /Device creation failed|Failed to initialise VAAPI connection|Error creating a MFX session|Cannot load libcuda|cu->cu\w+\(.*\) failed -> CUDA_ERROR_|No VA display found|unsupported drm device by media driver|No device available for decoder|Hardware device setup failed|Failed to set value '.*' for option 'init_hw_device'/ },
    // NVDEC rejecting this file's surface count is not the stream changing under a running pipeline, which the
    // `Error while filtering` it drags behind it would otherwise make of it
    { kind: 'decoder', regex: /cuvidCreateDecoder\(.*\) failed/ },
    { kind: 'mid-stream', regex: /hwaccel changed|Reconfiguring filter graph|Error submitting the frame|Error while filtering|Failed to transfer data to output frame/ },
    { kind: 'decoder', regex: /Failed setup for format|Error initializing the MFX video decoder|Error querying IO surface|Failed to get pixel format|No support for codec|Failed to allocate decoder|Error while processing the decoded data/ },
    { kind: 'encoder', regex: /No usable encoding profile|Hardware does not support encoding|Current pixel format is unsupported|Current resolution is unsupported|bit encode not supported|Error while opening encoder|Failed to end picture encode|OpenEncodeSessionEx failed/ },
    { kind: 'graph', regex: /Impossible to convert between the formats|Failed to configure (input|output) pad|hardware device reference is required|QSV requires a fixed frame pool|Error reinitializing filters|Error initializing (a simple filtergraph|filters)/ },
  ];

  private static readonly UNRETRYABLE_KINDS: readonly FfmpegFailureKind[] = ['input', 'output', 'aborted'];

  /** Keyed by the index in {@link PATTERNS}, so a kind listed twice keeps each entry's own precedence */
  private readonly matches = new Map<number, string>();
  private sawSoftwareFallback = false;

  /** Starts watching the handle; do it before anything is awaited or the first lines are missed */
  static observe(handle: FfmpegHandle): FfmpegFailureClassifier {
    const classifier = new FfmpegFailureClassifier();
    handle.on('log', (logLine) => classifier.consume(logLine));
    return classifier;
  }

  /** A decoder gave up on the device and continued in software, which FFmpeg does not consider an error */
  get silentlyFellBackToSoftware(): boolean {
    return this.sawSoftwareFallback;
  }

  classify(exitResult: FfmpegExitResult | null, error: unknown): FfmpegFailure {
    if (error instanceof UnretryableFfmpegJobError) {
      return { kind: 'aborted', retryable: false, message: error.message };
    }

    const match = this.determineMatch();
    const kind = match?.kind ?? 'unknown';
    return {
      kind,
      retryable: !FfmpegFailureClassifier.UNRETRYABLE_KINDS.includes(kind),
      message: this.describe(kind, match?.line ?? null, exitResult, error),
    };
  }

  private consume(logLine: FfmpegLogLine): void {
    if (logLine.level === 'info' || logLine.level === 'verbose' || logLine.level === 'debug' || logLine.level === 'trace') {
      return;
    }

    if (FfmpegFailureClassifier.SILENT_SOFTWARE_FALLBACK.test(logLine.message)) {
      this.sawSoftwareFallback = true;
    }

    for (const [index, pattern] of FfmpegFailureClassifier.PATTERNS.entries()) {
      if (!this.matches.has(index) && pattern.regex.test(logLine.message)) {
        this.matches.set(index, logLine.message);
      }
    }
  }

  private determineMatch(): { kind: FfmpegFailureKind, line: string } | null {
    for (const [index, pattern] of FfmpegFailureClassifier.PATTERNS.entries()) {
      const line = this.matches.get(index);
      if (line != null) {
        return { kind: pattern.kind, line };
      }
    }
    return null;
  }

  private describe(kind: FfmpegFailureKind, matchedLine: string | null, exitResult: FfmpegExitResult | null, error: unknown): string {
    const exitDescription = exitResult == null ? 'did not exit yet' : `exitCode=${exitResult.exitCode}, signal=${exitResult.signal}`;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `${kind} (${exitDescription})${matchedLine != null ? `: ${matchedLine}` : ''} – ${errorMessage}`;
  }
}
