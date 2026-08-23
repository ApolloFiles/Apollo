export const FFMPEG_LOG_LEVELS = ['panic', 'fatal', 'error', 'warning', 'info', 'verbose', 'debug', 'trace'] as const;
export type FfmpegLogLevel = (typeof FFMPEG_LOG_LEVELS)[number];

export type FfmpegLogLine = {
  readonly level: FfmpegLogLevel | null;
  readonly component: string | null;
  readonly message: string;
  readonly raw: string;
}

/**
 * Splits a log line written with `-loglevel level+…` into its `[component @ 0x…]`, `[level]` and message parts.
 *
 * Both prefixes are optional and FFmpeg does not commit to their order, so any leading bracket group that looks
 * like either one is consumed.
 */
export default class FfmpegLogLineParser {
  private static readonly PROBLEM_LEVELS: readonly FfmpegLogLevel[] = ['panic', 'fatal', 'error', 'warning'];
  private static readonly PREFIX_PATTERN = /^\[([^\]]*)]\s*/;
  private static readonly COMPONENT_PATTERN = /^(.+) @ 0x[0-9a-f]+$/;

  static parse(raw: string): FfmpegLogLine {
    let remaining = raw;
    let level: FfmpegLogLevel | null = null;
    let component: string | null = null;

    while (true) {
      const prefixMatch = FfmpegLogLineParser.PREFIX_PATTERN.exec(remaining);
      if (prefixMatch == null) {
        break;
      }

      const prefixContent = prefixMatch[1];
      if (FfmpegLogLineParser.isLogLevel(prefixContent)) {
        level = prefixContent;
      } else {
        const componentMatch = FfmpegLogLineParser.COMPONENT_PATTERN.exec(prefixContent);
        if (componentMatch == null) {
          break;
        }
        component = componentMatch[1];
      }

      remaining = remaining.substring(prefixMatch[0].length);
    }

    return { level, component, message: remaining, raw };
  }

  static isProblem(logLine: FfmpegLogLine): boolean {
    return logLine.level != null && FfmpegLogLineParser.PROBLEM_LEVELS.includes(logLine.level);
  }

  private static isLogLevel(value: string): value is FfmpegLogLevel {
    return (FFMPEG_LOG_LEVELS as readonly string[]).includes(value);
  }
}
