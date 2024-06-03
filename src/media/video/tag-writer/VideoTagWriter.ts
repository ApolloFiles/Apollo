import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { getUserStorageTmpRootOnSameFileSystem } from '../../../Constants';
import FfmpegProcess, { FfmpegMetrics } from '../../watch/live_transcode/FfmpegProcess';
import type { ExtendedVideoAnalysis } from '../analyser/VideoAnalyser.Types';

type TagMap = {
  [key: string]: string
}
type StreamTags = {
  [streamIndex: number]: TagMap
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
    streamOrder: number[],
    fileTags: TagMap,
    streamTags: StreamTags,
    streamDispositions: StreamDispositions,
    streamsToDelete: number[],
    coverJpegPath: string | null,
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    this.assertStreamsToDeleteAreValid(streamsToDelete, videoAnalysis, streamTags, streamDispositions);

    if (videoAnalysis.streams.length !== streamOrder.length) {
      throw new Error('Stream order array must contain all streams');
    }

    const streamOrderChanged = streamOrder.some((streamIndex, index) => streamIndex !== index);

    const tmpDir = Path.join(getUserStorageTmpRootOnSameFileSystem(), `${Crypto.randomUUID()}`);
    await Fs.promises.mkdir(tmpDir, { recursive: true });

    let tmpVideoFile = filePath;
    if (this.didTagsOrDispositionsChange(fileTags, streamTags, streamDispositions, videoAnalysis)) {
      tmpVideoFile = await this.writeTagsAndDispositions(tmpVideoFile, fileTags, streamTags, streamDispositions, streamsToDelete, tmpDir, onMetrics);
    }

    if (streamOrderChanged) {
      tmpVideoFile = await this.reorderStreams(tmpVideoFile, streamOrder, tmpDir, onMetrics);
    }

    let existingCoverStreamIndex: number | null = null;
    if (coverJpegPath != null) {
      existingCoverStreamIndex = this.findCoverImageStreamIndex(videoAnalysis);
      if (existingCoverStreamIndex != null) {
        streamsToDelete.push(existingCoverStreamIndex);
      }
    }

    if (streamsToDelete.length > 0) {
      if (streamOrderChanged) {
        throw new Error('Cannot delete streams and change stream order at the same time.');
      }

      const fileWithDeletedStreams = await this.deleteStreams(tmpVideoFile, streamsToDelete, tmpDir, onMetrics);
      if (tmpVideoFile !== filePath) {
        await Fs.promises.rm(tmpVideoFile);
      }
      tmpVideoFile = fileWithDeletedStreams;
    }

    if (coverJpegPath != null) {
      tmpVideoFile = await this.writeCoverImage(tmpVideoFile, coverJpegPath, existingCoverStreamIndex !== null ? streamTags[existingCoverStreamIndex] : {}, tmpDir, onMetrics);
    }
    return tmpVideoFile;
  }

  private static async writeTagsAndDispositions(
    filePath: string,
    fileTags: TagMap,
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

  private static async reorderStreams(
    filePath: string,
    streamOrder: number[],
    tmpDir: string,
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    const tmpFilePath = this.generateTmpFilePath(tmpDir, Path.extname(filePath));
    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map_metadata', '0',
      ...streamOrder.flatMap(streamIndex => ['-map', `0:${streamIndex}`]),

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

      '-map_metadata', '0',
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

  private static async writeCoverImage(
    filePath: string,
    coverJpegPath: string,
    baseStreamTags: TagMap,
    tmpDir: string,
    onMetrics: (metric: FfmpegMetrics) => void
  ): Promise<string> {
    const streamTags: TagMap = {
      ...baseStreamTags,
      mimetype: 'image/jpeg',
      filename: 'cover.jpg'
    };

    const tmpFilePath = this.generateTmpFilePath(tmpDir, Path.extname(filePath));
    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map_metadata', '0',
      '-c', 'copy',
      '-map', '0',
      '-attach', coverJpegPath,

      ...Object.entries(streamTags).flatMap(([key, value]) => ['-metadata:s:t:0', `${key}=${value}`]),

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

  static findCoverImageStreamIndex(videoAnalysis: ExtendedVideoAnalysis): number | null {
    const coverImageStreams = videoAnalysis.streams
      .filter(stream =>
        stream.codecType == 'video' &&
        stream.avgFrameRate == '0/0' &&
        stream.tags.mimetype?.toLowerCase()?.startsWith('image/') &&
        stream.tags.filename?.toLowerCase()?.startsWith('cover.')
      );

    if (coverImageStreams.length === 1) {
      return coverImageStreams[0].index;
    }
    return null;
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
    fileTags: TagMap,
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

  private static areTagsEqual(tags: TagMap, tagsToCompare: { [key: string]: string }): boolean {
    return Object.entries(tags).every(([key, value]) => tagsToCompare[key] === value)
      && Object.entries(tagsToCompare).every(([key, value]) => tags[key] === value);
  }

  private static areDispositionsEqual(dispositions: StreamDisposition, dispositionsToCompare: StreamDisposition): boolean {
    return Object.entries(dispositions).every(([key, value]) => dispositionsToCompare[key] === value)
      && Object.entries(dispositionsToCompare).every(([key, value]) => dispositions[key] === value);
  }

  private static generateTmpFilePath(tmpDir: string, extension: string): string {
    const tmpFilePath = Path.join(tmpDir, Crypto.randomUUID() + extension);
    if (Fs.existsSync(tmpFilePath)) {
      throw new Error(`File ${tmpFilePath} already exists and cannot be used as temporary file.`);
    }
    return tmpFilePath;
  }
}
