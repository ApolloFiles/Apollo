import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { getUserStorageTmpRootOnSameFileSystem } from '../../../Constants';
import FfmpegProcess, { FfmpegMetrics } from '../../watch/live_transcode/FfmpegProcess';
import type { ExtendedVideoAnalysis } from '../analyser/VideoAnalyser.Types';

type MetaTag = {
  key: string;
  value: string;
}
type StreamTags = {
  [streamIndex: number]: MetaTag
}

type StreamDisposition = {
  [key: string]: 0 | 1
}
type StreamDispositions = {
  [streamIndex: number]: StreamDisposition;
}

export default class VideoTagWriter {
  static async writeTagsIntoNewFile(
    filePath: string,
    videoAnalysis: ExtendedVideoAnalysis,
    fileTags: MetaTag,
    streamTags: StreamTags,
    streamDispositions: StreamDispositions,
    streamsToDelete: number[],
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    this.assertStreamsToDeleteAreValid(streamsToDelete, videoAnalysis, streamTags, streamDispositions);

    const tmpDir = Path.join(getUserStorageTmpRootOnSameFileSystem(), `${Crypto.randomUUID()}`);
    await Fs.promises.mkdir(tmpDir, { recursive: true });

    let tmpVideoFile = filePath;
    if (this.didTagsOrDispositionsChange(fileTags, streamTags, streamDispositions, videoAnalysis)) {
      tmpVideoFile = await this.writeTagsAndDispositions(filePath, fileTags, streamTags, streamDispositions, streamsToDelete, tmpDir, onMetrics);
    }
    if (streamsToDelete.length > 0) {
      const fileWithDeletedStreams = await this.deleteStreams(tmpVideoFile, streamsToDelete, tmpDir, onMetrics);
      if (tmpVideoFile !== filePath) {
        await Fs.promises.rm(tmpVideoFile);
      }
      tmpVideoFile = fileWithDeletedStreams;
    }
    return tmpVideoFile;
  }

  private static async writeTagsAndDispositions(
    filePath: string,
    fileTags: MetaTag,
    streamTags: StreamTags,
    streamDispositions: StreamDispositions,
    streamsToDelete: number[],
    tmpDir: string,
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    const tmpFilePath = this.generateTmpFilePath(tmpDir, Path.extname(filePath));

    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map_metadata:g', '-1',
      ...Object.entries(fileTags).flatMap(([key, value]) => ['-metadata:g', `${key}=${value}`])
    ];

    for (const streamIndex in streamTags) {
      ffmpegArgs.push(`-map_metadata:s:${streamIndex}`, '-1');

      for (const [key, value] of Object.entries(streamTags[streamIndex])) {
        ffmpegArgs.push(`-metadata:s:${streamIndex}`, `${key}=${value}`);
      }
    }
    for (const streamIndex of streamsToDelete) {
      ffmpegArgs.push(`-map_metadata:s:${streamIndex}`, `0:s:${streamIndex}`);
    }

    for (const streamIndex in streamDispositions) {
      const enabledDispositions = Object.entries(streamDispositions[streamIndex])
        .filter(([_, value]) => value === 1)
        .map(([key]) => key)
        .join('+');

      ffmpegArgs.push(`-disposition:${streamIndex}`, enabledDispositions || '0');
    }

    ffmpegArgs.push(
      '-c', 'copy',
      '-map', '0',

      tmpFilePath
    );

    const ffmpegProcess = new FfmpegProcess(ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: tmpDir
    });
    ffmpegProcess.on('metrics', onMetrics);
    await ffmpegProcess.waitForSuccessExit();

    return tmpFilePath;
  }

  private static async deleteStreams(
    filePath: string,
    streamsToDelete: number[],
    tmpDir: string,
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    const tmpFilePath = this.generateTmpFilePath(tmpDir, Path.extname(filePath));
    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map', '0',
      ...streamsToDelete.flatMap(streamIndex => ['-map', `-0:${streamIndex}`]),

      '-c', 'copy',

      tmpFilePath
    ];

    const ffmpegProcess = new FfmpegProcess(ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: tmpDir
    });
    ffmpegProcess.on('metrics', onMetrics);
    await ffmpegProcess.waitForSuccessExit();

    return tmpFilePath;
  }

  private static assertStreamsToDeleteAreValid(
    streamsToDelete: number[],
    videoAnalysis: ExtendedVideoAnalysis,
    streamTags: StreamTags,
    streamDispositions: StreamDispositions
  ): void {
    for (const streamIndex of streamsToDelete) {
      if (videoAnalysis.streams.length <= streamIndex) {
        throw new Error(`Stream ${streamIndex} does not exist in the file and cannot be deleted.`);
      }
      if (streamTags[streamIndex] != null || streamDispositions[streamIndex] != null) {
        throw new Error(`Cannot delete stream ${streamIndex} and modify its tags/dispositions at the same time.`);
      }
    }
  }

  private static didTagsOrDispositionsChange(
    fileTags: MetaTag,
    streamTags: StreamTags,
    streamDispositions: StreamDispositions,
    videoAnalysis: ExtendedVideoAnalysis
  ): boolean {
    if (fileTags != null && !this.areTagsEqual(fileTags, videoAnalysis.file.tags)) {
      return true;
    }

    for (const streamIndex in streamTags) {
      if (!this.areTagsEqual(streamTags[streamIndex], videoAnalysis.streams[streamIndex].tags)) {
        return true;
      }
    }

    for (const streamIndex in streamDispositions) {
      if (!this.areDispositionsEqual(streamDispositions[streamIndex], videoAnalysis.streams[streamIndex].disposition ?? {})) {
        return true;
      }
    }

    return false;
  }

  private static areTagsEqual(tags: MetaTag, tagsToCompare: { [key: string]: string }): boolean {
    return Object.entries(tags).every(([key, value]) => tagsToCompare[key] === value);
  }

  private static areDispositionsEqual(dispositions: StreamDisposition, dispositionsToCompare: StreamDisposition): boolean {
    return Object.entries(dispositions).every(([key, value]) => dispositionsToCompare[key] === value);
  }

  private static generateTmpFilePath(tmpDir: string, extension: string): string {
    const tmpFilePath = Path.join(tmpDir, Crypto.randomUUID() + extension);
    if (Fs.existsSync(tmpFilePath)) {
      throw new Error(`File ${tmpFilePath} already exists and cannot be used as temporary file.`);
    }
    return tmpFilePath;
  }
}
