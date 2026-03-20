import Crypto from 'node:crypto';
import Path from 'node:path';
import { injectable } from 'tsyringe';
import FileProvider from '../../../../../files/FileProvider.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type WriteableVirtualFile from '../../../../../files/WriteableVirtualFile.js';
import FfprobeExecutor from '../../../../../plugins/official/ffmpeg/FfprobeExecutor.js';
import FileTypeUtils from '../../../../../plugins/official/media/_old/FileTypeUtils.js';
import FfmpegVideoFileMetadataEditor
  from '../../../../../plugins/official/media/library/editor/FfmpegVideoFileMetadataEditor.js';
import ApolloFileURI from '../../../../../uri/ApolloFileURI.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import type { ORpcContractOutputs } from '../../../../contract/oRpcContract.js';
import type { ORpcImplementer, SubRouter } from '../../../ORpcRouter.js';

export type WriteLockInfo = {
  startTime: number,
  /** non-null if finished/error */
  endTime?: number,
  error?: {
    fileIdentifier: string | null,
    message: string,
  },

  totalFileCount: number,
  currentFileIndex: number,
};

// TODO: Add support for progress update in #writeChanges (so the user can have *some* indication of progress when it takes longer)
// FIXME: Clean-up that try-catch mess and remove this 'noinspection' comment
// FIXME: error logging/handling is very inconsistent... catching and logging stuff, just to re-throw it... And probably log again?
//noinspection ExceptionCaughtLocallyJS
@injectable()
export default class MediaEditorSubRouterFactory {
  private readonly activeWriteLocks = new Set<ApolloUser['id']>();
  private readonly mostRecentWriteLockInfo = new Map<ApolloUser['id'], WriteLockInfo>();

  constructor(
    private readonly ffprobeExecutor: FfprobeExecutor,
    private readonly ffmpegVideoFileMetadataEditor: FfmpegVideoFileMetadataEditor,
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly fileProvider: FileProvider,
    private readonly fileTypeUtils: FileTypeUtils,
  ) {
    setInterval(() => {
      const maxEndTime = Date.now() + 60 * 60 * 1000;
      for (const [userId, writeLockInfo] of this.mostRecentWriteLockInfo.entries()) {
        if (writeLockInfo.endTime != null && writeLockInfo.endTime >= maxEndTime) {
          this.mostRecentWriteLockInfo.delete(userId);
        }
      }
    }, 30 * 60 * 1000);
  }

  create(os: ORpcImplementer['media']): Pick<SubRouter<'media'>, 'editor'> {
    return {
      editor: {
        openPath: os.editor.openPath
          .handler(async ({ input, context, errors }) => {
            // TODO handle errors properly and pass them to the user
            const inputFileUri = ApolloFileURI.parse(input.fileUri);
            const inputFile = await this.fileProvider.provideForUserByUri(context.authSession.user, inputFileUri);

            if (!(await inputFile.exists())) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            if (!(inputFile instanceof LocalFile)) {
              // TODO: Send proper error
              throw errors.INVALID_INPUT();
            }

            const filesToAnalyze: LocalFile[] = await this.recursivelyFindVideoFiles(inputFile);

            const result: ORpcContractOutputs['media']['editor']['openPath'] = [];

            for (const file of filesToAnalyze) {
              try {
                const ffprobeResult = await this.ffprobeExecutor.probe(file.getAbsolutePathOnHost(), true);

                result.push({
                  identifier: file.toURI().toString(),
                  displayName: Path.relative(inputFile.path, file.path),

                  videoMeta: {
                    file: {
                      tags: Object.entries(ffprobeResult.format.tags).map(([key, value]) => ({ key, value })),
                    },
                    streams: ffprobeResult.streams.map(stream => {
                      const codecNameShort = stream.codec_name ?? stream.codec_tag;
                      const codecNameLong = stream.codec_long_name ?? stream.codec_tag_string;

                      let streamContext: string[] = [`${codecNameLong} (${codecNameShort})`];

                      if (stream.codec_type === 'video') {
                        let humanReadableFps = '? fps';
                        if (/^\d+\/\d+$/.test(stream.avg_frame_rate)) {
                          const [numerator, denominator] = stream.avg_frame_rate
                            .split('/')
                            .map(part => parseInt(part, 10));
                          if (denominator !== 0) {
                            if ((numerator / denominator).toFixed(2).endsWith('.00')) {
                              humanReadableFps = (numerator / denominator).toFixed(0);
                            } else {
                              humanReadableFps = '~' + (numerator / denominator).toFixed(2);
                            }

                            humanReadableFps += ' fps';
                          }
                        }

                        streamContext.push(
                          stream.profile ?? 'Unknown Profile',
                          `${stream.width}x${stream.height} (${stream.display_aspect_ratio})`,
                          humanReadableFps,
                          stream.pix_fmt ?? 'Unknown Pixel Format',
                        );
                      } else if (stream.codec_type === 'audio') {
                        let bitRateHumanReadable = '? kb/s';
                        if (stream.bit_rate != null && /^\d+$/.test(stream.bit_rate)) {
                          const bitRateNum = parseInt(stream.bit_rate, 10);

                          if (bitRateNum >= 1_000_000) {
                            bitRateHumanReadable = (bitRateNum / 1_000_000).toFixed(2) + ' Mb/s';
                          } else if (bitRateNum >= 1_000) {
                            bitRateHumanReadable = (bitRateNum / 1_000).toFixed(2) + ' kb/s';
                          } else {
                            bitRateHumanReadable = bitRateNum + ' b/s';
                          }
                        }

                        let humanReadableSampleRate = '? kHz';
                        if (stream.sample_rate != null && /^\d+$/.test(stream.sample_rate)) {
                          const sampleRateNum = parseInt(stream.sample_rate, 10);
                          if (sampleRateNum >= 1_000_000) {
                            if ((sampleRateNum / 1_000_000).toFixed(2).endsWith('.00')) {
                              humanReadableSampleRate = (sampleRateNum / 1_000_000).toFixed(0);
                            } else {
                              humanReadableSampleRate = (sampleRateNum / 1_000_000).toFixed(2);
                            }
                            humanReadableSampleRate += ' MHz';
                          } else if (sampleRateNum >= 1_000) {
                            if ((sampleRateNum / 1_000).toFixed(2).endsWith('.00')) {
                              humanReadableSampleRate = (sampleRateNum / 1_000).toFixed(0);
                            } else {
                              humanReadableSampleRate = (sampleRateNum / 1_000).toFixed(2);
                            }
                            humanReadableSampleRate += ' kHz';
                          } else {
                            humanReadableSampleRate = sampleRateNum + ' Hz';
                          }
                        }

                        streamContext.push(
                          stream.profile ?? 'Unknown Profile',
                          stream.channel_layout ?? `${stream.channels} Channels`,
                          bitRateHumanReadable,
                          humanReadableSampleRate,
                        );
                      }

                      return {
                        type: stream.codec_type === 'data' ? 'misc' : stream.codec_type,
                        streamContextText: streamContext.filter(c => c != null && c !== '').join(' – '),

                        tags: Object.entries(stream.tags ?? {}).map(([key, value]) => ({ key, value })),
                        disposition: stream.disposition,
                      };
                    }),
                  },
                });
              } catch (err) {
                //FIXME: Handle non-videos files
                console.warn(err);
              }
            }

            return result;
          }),

        writeChanges: os.editor.writeChanges
          .handler(async ({ input, context, errors }) => {
            const loggedInUser = context.authSession.user;

            if (this.activeWriteLocks.has(loggedInUser.id)) {
              throw errors.ANOTHER_WRITE_ALREADY_IN_PROGRESS({
                data: {
                  progress: this.mostRecentWriteLockInfo.get(loggedInUser.id)!,
                },
              });
            }

            const writeLockInfo: WriteLockInfo = {
              startTime: Date.now(),

              totalFileCount: input.files.length,
              currentFileIndex: 0,
            };

            this.activeWriteLocks.add(loggedInUser.id);
            this.mostRecentWriteLockInfo.set(loggedInUser.id, writeLockInfo);

            let tmpDirVirtualFile: LocalFile;
            let tmpDir: WriteableVirtualFile;

            try {
              const tmpFileSystem = this.fileSystemProvider.provideApolloFileSystemsForUser(loggedInUser).tmp;
              const _tmpDirVirtualFile = tmpFileSystem.getFile('/_media-editor/' + Crypto.randomUUID());
              if (!(_tmpDirVirtualFile instanceof LocalFile)) {
                throw new Error(`The user's temporary file system needs to be a local one with the current implementation`);
              }

              tmpDirVirtualFile = _tmpDirVirtualFile;
              tmpDir = tmpFileSystem.getWriteableFile(_tmpDirVirtualFile);
              await tmpDir.mkdir();
            } catch (err) {
              this.activeWriteLocks.delete(loggedInUser.id);

              writeLockInfo.error = {
                fileIdentifier: null,
                message: 'An unexpected error occurred while preparing the write operation – Please have an administrator check the system logs',
              };
              console.error('Error during preparing media metadata changes write operation:', err);
              throw err;
            }

            const executeWriteForFiles = async () => {
              for (const [index, file] of input.files.entries()) {
                writeLockInfo.currentFileIndex = index;

                try {
                  const virtualFile = await this.fileProvider.provideForUserByUri(loggedInUser, ApolloFileURI.parse(file.identifier));
                  if (!(virtualFile instanceof LocalFile)) {
                    throw new Error(`Currently only local files are supported for media metadata editing`);
                  }

                  await this.ffmpegVideoFileMetadataEditor.edit(
                    virtualFile.getAbsolutePathOnHost(),
                    tmpDirVirtualFile.getAbsolutePathOnHost(),
                    file.desiredState,
                  );
                } catch (err: unknown) {
                  if (err instanceof Error) {
                    writeLockInfo.error = {
                      fileIdentifier: file.identifier,
                      message: err.message,
                    };
                  }

                  throw err;
                }
              }
            };

            executeWriteForFiles()
              .catch(err => {
                if (writeLockInfo.error === undefined) {
                  writeLockInfo.error = {
                    fileIdentifier: null,
                    message: 'An unexpected error occurred – Please have an administrator check the system logs',
                  };
                }

                console.error('Error during writing media metadata changes:', err);
              })
              .finally(() => {
                tmpDir.delete(true).catch(console.error);

                writeLockInfo.endTime = Date.now();
                this.activeWriteLocks.delete(loggedInUser.id);
              });

            return writeLockInfo;
          }),

        getWriteProgress: os.editor.getWriteProgress
          .handler(async ({ context }) => {
            return this.mostRecentWriteLockInfo.get(context.authSession.user.id) ?? null;
          }),
      },
    };
  }

  private async recursivelyFindVideoFiles(file: LocalFile): Promise<LocalFile[]> {
    const videoFiles = await this.recursivelyFindVideoFilesInner(file, 150);
    return videoFiles.files;
  }

  private async recursivelyFindVideoFilesInner(file: LocalFile, remainingFileIterations: number): Promise<{
    files: LocalFile[],
    remainingFileIterations: number,
  }> {
    const filesToAnalyze: LocalFile[] = [];

    if (await file.isFile()) {
      const mimeType = await this.fileTypeUtils.getMimeTypeTrustExtension(file.getAbsolutePathOnHost());

      if (mimeType == null || mimeType.startsWith('video/')) {
        filesToAnalyze.push(file);
      }

      return { files: filesToAnalyze, remainingFileIterations };
    }

    const childFiles = await file.getFiles();
    for (const childFile of childFiles) {
      const videoFileResult = await this.recursivelyFindVideoFilesInner(childFile, remainingFileIterations - 1);

      remainingFileIterations = videoFileResult.remainingFileIterations;
      filesToAnalyze.push(...videoFileResult.files);
    }

    return { files: filesToAnalyze, remainingFileIterations };
  }
}
