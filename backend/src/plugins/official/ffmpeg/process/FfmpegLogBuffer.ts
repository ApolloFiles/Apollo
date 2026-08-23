import FfmpegLogLineParser, { type FfmpegLogLine } from './FfmpegLogLineParser.js';

/**
 * Keeps the most recent FFmpeg log lines around so a failed process can explain itself.
 *
 * Warnings and errors are kept in a second buffer because a run with a high verbosity produces enough output to
 * push the actual failure reason out of the tail long before the process exits.
 */
export default class FfmpegLogBuffer {
  private static readonly MAX_TAIL_LINES = 40;
  private static readonly MAX_PROBLEM_LINES = 20;
  private static readonly MAX_FULL_LOG_CHARS = 4 * 1024 * 1024;

  private readonly tailLines: FfmpegLogLine[] = [];
  private readonly problemLines: FfmpegLogLine[] = [];
  private readonly fullLogLines: string[] | null;
  private fullLogChars = 0;
  private fullLogTruncated = false;

  constructor(captureFullLog: boolean) {
    this.fullLogLines = captureFullLog ? [] : null;
  }

  push(logLine: FfmpegLogLine): void {
    FfmpegLogBuffer.pushCapped(this.tailLines, logLine, FfmpegLogBuffer.MAX_TAIL_LINES);
    if (FfmpegLogLineParser.isProblem(logLine)) {
      FfmpegLogBuffer.pushCapped(this.problemLines, logLine, FfmpegLogBuffer.MAX_PROBLEM_LINES);
    }

    this.appendToFullLog(logLine);
  }

  getTail(): string {
    return FfmpegLogBuffer.format(this.tailLines);
  }

  getProblems(): string {
    return FfmpegLogBuffer.format(this.problemLines);
  }

  getFullLog(): string | null {
    if (this.fullLogLines == null) {
      return null;
    }

    const fullLog = this.fullLogLines.join('\n');
    return this.fullLogTruncated ? `${fullLog}\n[…truncated…]` : fullLog;
  }

  private appendToFullLog(logLine: FfmpegLogLine): void {
    if (this.fullLogLines == null) {
      return;
    }
    if (this.fullLogChars >= FfmpegLogBuffer.MAX_FULL_LOG_CHARS) {
      this.fullLogTruncated = true;
      return;
    }

    this.fullLogLines.push(logLine.raw);
    this.fullLogChars += logLine.raw.length + 1;
  }

  private static format(logLines: readonly FfmpegLogLine[]): string {
    return logLines.map((logLine) => logLine.raw).join('\n');
  }

  private static pushCapped(target: FfmpegLogLine[], logLine: FfmpegLogLine, maxLines: number): void {
    target.push(logLine);
    if (target.length > maxLines) {
      target.shift();
    }
  }
}
