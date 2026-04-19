import Crypto from 'node:crypto';
import Path from 'node:path';
import { injectable } from 'tsyringe';
import FsUtils from '../../../../../utils/FsUtils.js';
import BufferedChildProcess from '../../../../builtin/child_process/BufferedChildProcess.js';
import FfprobeExecutor, { type ExtendedProbeResult } from '../../../ffmpeg/FfprobeExecutor.js';
import FfmpegProcessError from './FfmpegProcessError.js';
import UnexpectedDesiredMetadataError from './UnexpectedDesiredMetadataError.js';

type Tag = {
  key: string,
  value: string,
}

type StreamMetadata = {
  readonly index: number,
  order: number,

  tags: Tag[],
  disposition: Record<string, boolean>,
}

export type DesiredMetadata = {
  file: {
    tags: Tag[],
  },
  streams: StreamMetadata[],
  streamsToDelete: number[],
}

@injectable()
export default class FfmpegVideoFileMetadataEditor {
  // TODO: Add support for chapters (remember to update #isDesiredStateIsAlreadyPresent)

  constructor(
    private readonly ffprobeExecutor: FfprobeExecutor,
  ) {
  }

  /**
   * `tmpDirPath` *should* be on the same file system as `filePath`
   */
  async edit(
    inputFilePath: string,
    tmpDirPath: string,
    desiredMetadata: DesiredMetadata,
  ): Promise<void> {
    const inputFileProbe = await this.ffprobeExecutor.probe(inputFilePath, true);

    this.ensureDesiredMetadataLooksPlausible(desiredMetadata, inputFileProbe);

    this.normalizeDesiredMetadata(desiredMetadata);

    if (this.isDesiredStateIsAlreadyPresent(desiredMetadata, inputFileProbe)) {
      console.debug('The desired metadata state is already present in the input file, so skipping writing changes with ffmpeg');
      return;
    }

    const tmpOutFile = await this.writeChangesToTmpFile(desiredMetadata, inputFilePath, tmpDirPath);

    await FsUtils.moveOrAtomicCopyFile(tmpOutFile, inputFilePath);
  }

  private async writeChangesToTmpFile(desiredMetadata: DesiredMetadata, inputPath: string, tmpDirPath: string): Promise<string> {
    const tempOutputFilePath = Path.join(tmpDirPath, `${Crypto.randomUUID()}${Path.extname(inputPath)}`);

    const ffmpegArgs = [
      '-loglevel', 'level+warning',

      '-i', inputPath,

      // Copy streams and chapters from input
      '-map_chapters', '0',
      '-c', 'copy',
    ];

    // copy all streams that are not marked for deletion (assumes they've been sorted already)
    for (const stream of desiredMetadata.streams) {
      ffmpegArgs.push('-map', `0:${stream.index}`);
    }

    // overwrite file/global metadata tags
    ffmpegArgs.push('-map_metadata:g', '-1');
    for (const tag of desiredMetadata.file.tags) {
      ffmpegArgs.push('-metadata:g', `${tag.key}=${tag.value}`);
    }

    // overwrite stream metadata tags
    for (let outputStreamIndex = 0; outputStreamIndex < desiredMetadata.streams.length; ++outputStreamIndex) {
      ffmpegArgs.push(`-map_metadata:s:${outputStreamIndex}`, '-1');

      for (const tag of desiredMetadata.streams[outputStreamIndex].tags) {
        if (tag.key !== '' && tag.value !== '') {
          ffmpegArgs.push(`-metadata:s:${outputStreamIndex}`, `${tag.key}=${tag.value}`);
        }
      }

      const enabledDispositions = Object.entries(desiredMetadata.streams[outputStreamIndex].disposition)
        .filter(([_, value]) => value)
        .map(([key]) => key)
        .join('+');
      ffmpegArgs.push(`-disposition:${outputStreamIndex}`, enabledDispositions || '0');
    }

    ffmpegArgs.push(tempOutputFilePath);

    try {
      await this.runFfmpeg(ffmpegArgs, tmpDirPath);
    } catch (err) {
      if (err instanceof FfmpegProcessError &&
        err.exitCode === 234 &&
        err.stderr.includes(`Can't write packet with unknown timestamp`) &&
        err.stderr.includes('Error submitting a packet to the muxer: Invalid argument')) {
        console.warn(`ffmpeg was unable to write video metadata changes, because of missing/unknown timestamps in the input file. Retrying with '-fflags +genpts', which will try to generate them`);

        ffmpegArgs.unshift('-fflags', '+genpts');
        await this.runFfmpeg(ffmpegArgs, tmpDirPath);
        return tempOutputFilePath;
      }

      throw err;
    }

    return tempOutputFilePath;
  }

  private ensureDesiredMetadataLooksPlausible(desiredMetadata: DesiredMetadata, ffprobeResult: ExtendedProbeResult): void {
    const streamIndices = desiredMetadata.streams.map(stream => stream.index);
    if (new Set(streamIndices).size !== streamIndices.length) {
      throw new UnexpectedDesiredMetadataError('There are duplicate stream indices in DesiredMetadata.streams');
    }

    if (new Set(desiredMetadata.streamsToDelete).size !== desiredMetadata.streamsToDelete.length) {
      throw new UnexpectedDesiredMetadataError('There are duplicate stream indices in DesiredMetadata.streamsToDelete');
    }

    if (new Set(desiredMetadata.streams.map(s => s.order)).size !== desiredMetadata.streams.length) {
      throw new UnexpectedDesiredMetadataError('There are duplicate stream order values in DesiredMetadata.streams');
    }

    for (const streamIdToDelete of desiredMetadata.streamsToDelete) {
      if (desiredMetadata.streams.some((stream) => stream.index === streamIdToDelete)) {
        throw new UnexpectedDesiredMetadataError(`Stream with index ${streamIdToDelete} is marked for deletion and metadata modification at the same time`);
      }
    }

    for (const stream of ffprobeResult.streams) {
      if (!desiredMetadata.streamsToDelete.includes(stream.index) && !desiredMetadata.streams.some(s => s.index === stream.index)) {
        throw new UnexpectedDesiredMetadataError(`Stream with index ${stream.index} from input file is not mentioned in DesiredMetadata.streams or DesiredMetadata.streamsToDelete`);
      }
    }

    for (const stream of desiredMetadata.streams) {
      for (const tag of stream.tags) {
        if (tag.key.includes('=')) {
          throw new UnexpectedDesiredMetadataError(`Stream ${stream.index} has a tag that contains '=', which is not supported`);
        }
        if (/[\x00-\x1f\x7f]/.test(tag.key)) {
          throw new UnexpectedDesiredMetadataError(`Stream ${stream.index} has a tag key that contains control characters, which is cowardly rejected (although it *might* actually work)`);
        }
      }
    }

    if (ffprobeResult.streams.length !== (desiredMetadata.streams.length + desiredMetadata.streamsToDelete.length)) {
      throw new UnexpectedDesiredMetadataError(`The total number of streams in DesiredMetadata.streams and DesiredMetadata.streamsToDelete does not match the number of streams in the input file`);
    }
  }

  private normalizeDesiredMetadata(desiredMetadata: DesiredMetadata): void {
    desiredMetadata.streams.sort((a, b) => a.order - b.order);

    desiredMetadata.file.tags = desiredMetadata.file.tags.filter((tag) => tag.key !== '' && tag.value !== '');
    for (const stream of desiredMetadata.streams) {
      stream.tags = stream.tags.filter((tag) => tag.key !== '' && tag.value !== '');
    }
  }

  private isDesiredStateIsAlreadyPresent(desiredMetadata: DesiredMetadata, ffprobeResult: ExtendedProbeResult): boolean {
    // we have a stream to delete?
    if (desiredMetadata.streamsToDelete.length > 0) {
      return false;
    }

    // we have to re-order streams?
    for (const stream of desiredMetadata.streams) {
      if (stream.index !== stream.order) {
        return false;
      }
    }

    // *something* in the file tags is different?
    {
      if (desiredMetadata.file.tags.length !== Object.keys(ffprobeResult.format.tags).length) {
        return false;
      }

      const desiredFileTags = new Map(desiredMetadata.file.tags.map(tag => [tag.key, tag.value]));
      const existingFileTags = new Map(Object.entries(ffprobeResult.format.tags));
      for (const [desiredKey, desiredValue] of desiredFileTags.entries()) {
        const existingValue = existingFileTags.get(desiredKey);
        if (existingValue !== desiredValue) {
          return false;
        }
      }
    }


    for (const desiredStream of desiredMetadata.streams) {
      const existingStream = ffprobeResult.streams.find(stream => stream.index === desiredStream.index);
      if (existingStream == null) {
        return false;
      }

      // *something* in the stream tags is different?
      {
        if (desiredStream.tags.length !== Object.keys(existingStream.tags).length) {
          return false;
        }

        const desiredStreamTags = new Map(desiredStream.tags.map(tag => [tag.key, tag.value]));
        const existingStreamTags = new Map(Object.entries(existingStream.tags));

        for (const [desiredKey, desiredValue] of desiredStreamTags.entries()) {
          const existingValue = existingStreamTags.get(desiredKey);
          if (existingValue !== desiredValue) {
            return false;
          }
        }
      }

      // something in the disposition flags different?
      {
        if (Object.keys(desiredStream.disposition).length !== Object.keys(existingStream.disposition).length) {
          return false;
        }

        for (const [desiredKey, desiredValue] of Object.entries(desiredStream.disposition)) {
          const existingValue = existingStream.disposition[desiredKey];
          if (existingValue !== desiredValue) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private async runFfmpeg(args: string[], cwd: string): Promise<void> {
    const ffmpegProcess = await BufferedChildProcess.spawn('ffmpeg', args, { cwd });

    if (ffmpegProcess.exitCode !== 0) {
      throw FfmpegProcessError.create(ffmpegProcess, args);
    }
  }
}
