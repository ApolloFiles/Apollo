/** Reads back what a spawned command was pointed at, for log lines that have to name the file a failure was about */
export default class FfmpegArgsUtil {
  /** Deduplicated: a job that burns in a subtitle gives one file several demuxers of its own */
  static describeInputs(args: readonly string[]): string {
    const paths = new Set(args.filter((_, index) => args[index - 1] === '-i'));
    return paths.size === 0 ? 'n/a' : [...paths].map((path) => `'${path}'`).join(', ');
  }
}
