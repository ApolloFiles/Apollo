import {
  type MediaLibraryMediaExternalIdSource,
  MediaLibraryMediaStreamType,
} from '../../../../../database/prisma-client/enums.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import CachedFfprobeExecutor from '../../../ffmpeg/CachedFfprobeExecutor.js';
import { type ExtendedProbeResult } from '../../../ffmpeg/FfprobeExecutor.js';
import PlayableDurationUtil, {
  type DurationRelevantStream,
  type StreamSpanSource,
} from '../../../ffmpeg/PlayableDurationUtil.js';
import ProbeTagUtil from '../../../ffmpeg/ProbeTagUtil.js';
import ForcedSubtitleDetector, { type SubtitleStreamCandidate } from './ForcedSubtitleDetector.js';
import LanguageTagUtil from './LanguageTagUtil.js';

type ExternalIds = Partial<Record<MediaLibraryMediaExternalIdSource, string>>;
type ProbeStream = ExtendedProbeResult['streams'][number];

export type MediaDirectoryInfo = {
  title: string,
  year?: number,
  externalIds?: ExternalIds,
}

export type CommonVideoMetadata = {
  title: string,
  synopsis: string | null,
  durationInSec: number,
  externalIds: ExternalIds,
  streams: {
    index: number,
    type: MediaLibraryMediaStreamType,
    normalizedLanguage: string,
    flagDefault: boolean,
    flagCommentary: boolean,
    forHearingImpaired: boolean,
    treatAsForced: boolean,
  }[],
}

export default abstract class AbstractScanner {
  private static MEDIA_DIR_REGEX = /^(.*?)(?:\s*\((\d{4})\))?((?:\s*[\[{][a-z0-9_.-]+[\]}])+)*$/i;
  private static EXTERNAL_ID_EXTRACTOR_REGEX = /[\[{]([a-z0-9_.]+)-([[a-z0-9_.]+)[\]}]/gi;
  private static EXTERNAL_ID_MAPPING: Record<string, MediaLibraryMediaExternalIdSource> = {
    // Plex
    'imdb': 'IMDB',
    'tmdb': 'THE_MOVIE_DB',

    // Jellyfin
    'imdbid': 'IMDB',
    'tmdbid': 'THE_MOVIE_DB',
  };

  protected constructor(
    private readonly ffprobeExecutor: CachedFfprobeExecutor,
  ) {
  }

  protected getRelativeFilePath(mediaDirectory: VirtualFile, file: VirtualFile): string {
    const mediaDirPath = mediaDirectory.path;
    const filePath = file.path;

    if (!filePath.startsWith(mediaDirPath)) {
      throw new Error(`File path '${filePath}' is not inside media directory path '${mediaDirPath}'`);
    }
    return filePath.substring(mediaDirPath.length + 1);
  }

  protected extractInfoFromMediaDirectoryName(directory: VirtualFile): MediaDirectoryInfo {
    const directoryName = directory.getFileName().trim();

    const match = directoryName.match(AbstractScanner.MEDIA_DIR_REGEX);
    if (match) {
      const title = match[1].trim();
      const year = match[2] ? parseInt(match[2], 10) : undefined;
      const metadataTagsRaw = match[3]?.trim();
      const externalIds = metadataTagsRaw ? this.parseExternalIdFromFileNameSnippet(metadataTagsRaw) : undefined;

      return {
        title,
        year,
        externalIds,
      };
    }

    return { title: directoryName };
  }

  protected async extractCommonVideoMetadata(file: VirtualFile, fallbackTitle: string): Promise<CommonVideoMetadata> {
    let title = fallbackTitle;
    let synopsis: string | null = null;
    let durationInSec = 0;
    const externalIds: CommonVideoMetadata['externalIds'] = {};
    const streams: CommonVideoMetadata['streams'] = [];

    if (file instanceof LocalFile) {
      const fileProbe = await this.ffprobeExecutor.probeFull(file);
      durationInSec = Math.ceil(this.determinePlayableDurationInSec(fileProbe) ?? 0);

      const extractedTitle = this.extractMetadataFromProbe(fileProbe, 'title') ?? this.extractMetadataFromProbe(fileProbe, 'name');
      if (extractedTitle != null && extractedTitle.trim().length > 0) {
        title = extractedTitle.trim();
      }

      const extractedSynopsis = this.extractMetadataFromProbe(fileProbe, 'synopsis');
      if (extractedSynopsis != null && extractedSynopsis.trim().length > 0) {
        synopsis = extractedSynopsis.trim();
      }

      const theMovieDbId = this.extractMetadataFromProbe(fileProbe, 'TMDB');
      if (theMovieDbId != null) {
        externalIds['THE_MOVIE_DB'] = theMovieDbId;
      }

      const imdbId = this.extractMetadataFromProbe(fileProbe, 'IMDB');
      if (imdbId != null) {
        externalIds['IMDB'] = imdbId;
      }

      const theTvDbId = this.extractMetadataFromProbe(fileProbe, 'TVDB2');
      if (theTvDbId != null) {
        externalIds['THE_TV_DB'] = theTvDbId;
      }

      const subtitleStreamCandidates: SubtitleStreamCandidate[] = [];

      for (const stream of fileProbe.streams) {
        let streamType: MediaLibraryMediaStreamType;
        switch (stream.codec_type) {
          case 'video':
            streamType = MediaLibraryMediaStreamType.VIDEO;
            break;
          case 'audio':
            streamType = MediaLibraryMediaStreamType.AUDIO;
            break;
          case 'subtitle':
            streamType = MediaLibraryMediaStreamType.SUBTITLE;
            break;

          default:
            continue;
        }

        const rawLanguageTag = ProbeTagUtil.getValue(stream.tags, 'language');
        const parsedLanguageTag = LanguageTagUtil.canonicalize(rawLanguageTag);

        if (streamType === MediaLibraryMediaStreamType.SUBTITLE) {
          subtitleStreamCandidates.push({
            index: stream.index,
            normalizedLanguage: parsedLanguageTag.language,
            title: this.extractStreamTitle(stream.tags),
            forcedDisposition: stream.disposition['forced'] ?? false,
            eventCount: ProbeTagUtil.getPositiveIntValue(stream.tags, 'NUMBER_OF_FRAMES'),
            spanInSec: this.extractStreamSpanInSec(stream),
          });
        }

        streams.push({
          index: stream.index,
          type: streamType,

          normalizedLanguage: parsedLanguageTag.language,

          flagDefault: stream.disposition['default'] ?? false,
          flagCommentary: stream.disposition['comment'] ?? false,

          forHearingImpaired: stream.disposition['hearing_impaired'] ?? false,
          treatAsForced: false,
        });
      }

      const forcedStreamIndices = ForcedSubtitleDetector.detect(subtitleStreamCandidates, durationInSec);
      for (const stream of streams) {
        stream.treatAsForced = forcedStreamIndices.has(stream.index);
      }
    } else {
      console.error(
        '[ERROR] Cannot probe file duration for non-local files during media library scan:',
        file.toURI().toString(),
      );
    }

    return {
      title,
      synopsis,
      durationInSec,
      externalIds,
      streams,
    };
  }

  protected extractMetadataFromProbe(probeResult: ExtendedProbeResult, tag: string): string | null {
    return ProbeTagUtil.getValueIncludingLanguageSuffixed(probeResult.format.tags, tag);
  }

  private extractStreamTitle(tags: Record<string, string>): string {
    return ProbeTagUtil.getValueIncludingLanguageSuffixed(tags, 'title')
      ?? ProbeTagUtil.getValueIncludingLanguageSuffixed(tags, 'name')
      ?? '';
  }

  /** Seconds between the first and the last packet of a stream – *not* the accumulated on-screen time. */
  private extractStreamSpanInSec(stream: ProbeStream): number | null {
    return PlayableDurationUtil.determineStreamSpanInSec(this.toStreamSpanSource(stream));
  }

  /**
   * The container's duration is the end of its *longest* track, which may well be a subtitle stream
   * that outlives video and audio – what actually plays is what {@link PlayableDurationUtil} determines.
   */
  private determinePlayableDurationInSec(fileProbe: ExtendedProbeResult): number | null {
    const relevantStreams: DurationRelevantStream[] = [];
    for (const stream of fileProbe.streams) {
      if (stream.codec_type === 'video' || stream.codec_type === 'audio') {
        relevantStreams.push({
          ...this.toStreamSpanSource(stream),
          type: stream.codec_type,
        });
      }
    }

    return PlayableDurationUtil.determinePlayableDurationInSec(
      relevantStreams,
      PlayableDurationUtil.parseFiniteFloat(fileProbe.format.duration),
    );
  }

  private toStreamSpanSource(stream: ProbeStream): StreamSpanSource {
    return {
      duration: stream.duration,
      durationTs: stream.duration_ts,
      timeBase: stream.time_base,
      tags: stream.tags,
    };
  }

  private parseExternalIdFromFileNameSnippet(metadataTagsRaw: string): ExternalIds {
    const externalIds: ExternalIds = {};

    const matches = metadataTagsRaw.matchAll(AbstractScanner.EXTERNAL_ID_EXTRACTOR_REGEX);
    for (const match of matches) {
      const key = match[1]?.toLowerCase();
      let value = match[2];
      const externalIdSource: MediaLibraryMediaExternalIdSource | undefined = AbstractScanner.EXTERNAL_ID_MAPPING[key];

      if (key && value && externalIdSource) {
        if (externalIdSource === 'THE_MOVIE_DB') {
          if (value.toLowerCase().startsWith('tv_')) {
            value = 'tv/' + value.substring('tv_'.length);
          } else if (value.toLowerCase().startsWith('movie_')) {
            value = 'movie/' + value.substring('movie_'.length);
          }
        }

        externalIds[externalIdSource] = value;
      }
    }

    return externalIds;
  }
}
