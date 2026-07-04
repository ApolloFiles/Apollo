import { singleton } from 'tsyringe';
import type { ExtendedVideoAnalysis, Stream } from '../../../video/analyser/VideoAnalyser.Types.js';
import TextBasedSubtitleExtractor from '../../../watch/live_transcode/extractor/TextBasedSubtitleExtractor.js';
import ImageBasedSubtitleHelper from '../ffmpeg/ImageBasedSubtitleHelper.js';

// FIXME: Give user more control about stream selection
@singleton()
export default class AutoTranscodeStreamSelector {
  /**
   * @param burnInSubtitleStreamIndex Controls which (if any) image-based subtitle stream is burned into the video:
   *   `undefined` = auto-select (legacy heuristic), `null` = explicitly none,
   *   `number` = burn exactly that stream (validated to be a supported image-based subtitle; falls back to none if invalid).
   */
  selectStreams(videoAnalysis: ExtendedVideoAnalysis, burnInSubtitleStreamIndex?: number | null): Stream[] {
    const firstVideoStream = videoAnalysis.streams.find(stream => stream.codecType === 'video');
    if (firstVideoStream == null) {
      throw new Error('No video stream found');
    }

    const audioStreams = videoAnalysis.streams.filter(stream => stream.codecType === 'audio');
    audioStreams.sort((a, b) => this.compareStreamsByLanguage(a, b, ['jpn', 'eng', 'deu']));

    const streamsToTranscode = [firstVideoStream, ...audioStreams];

    const subtitleToBurnIn = this.selectSubtitleToBurnIn(videoAnalysis, audioStreams, burnInSubtitleStreamIndex);
    if (subtitleToBurnIn != null) {
      streamsToTranscode.push(subtitleToBurnIn);
    }

    return streamsToTranscode;
  }

  private selectSubtitleToBurnIn(videoAnalysis: ExtendedVideoAnalysis, sortedAudioStreams: Stream[], burnInSubtitleStreamIndex?: number | null): Stream | null {
    // Explicit, client-driven selection
    if (burnInSubtitleStreamIndex === null) {
      return null;
    }
    if (typeof burnInSubtitleStreamIndex === 'number') {
      const stream = videoAnalysis.streams.find(stream => stream.index === burnInSubtitleStreamIndex);
      if (stream != null && ImageBasedSubtitleHelper.isSupportedImageBasedSubtitleStream(stream)) {
        return stream;
      }
      console.warn(`Requested burn-in subtitle stream #${burnInSubtitleStreamIndex} is not a supported image-based subtitle; ignoring`);
      return null;
    }

    // Auto-select (legacy heuristic): only burn an image-based subtitle when there are no text-based ones
    const subtitleStreams = videoAnalysis.streams.filter(stream => stream.codecType === 'subtitle');
    subtitleStreams.sort((a, b) => this.compareStreamsByLanguage(a, b, ['deu', 'eng']));
    const shouldTranscodeImageBasedSubtitles = subtitleStreams.length > 0 && !this.containsTextBasedSubtitles(videoAnalysis.streams);
    if (!shouldTranscodeImageBasedSubtitles) {
      return null;
    }

    const firstImageBasedSubtitle = subtitleStreams.find(stream => ImageBasedSubtitleHelper.isSupportedImageBasedSubtitleStream(stream)) ?? null;
    if (firstImageBasedSubtitle == null) {
      return null;
    }

    if (sortedAudioStreams.length === 0) {
      return firstImageBasedSubtitle;
    }
    if (sortedAudioStreams[0].tags.language === 'jpn' || sortedAudioStreams[0].tags.language === 'und') {
      return firstImageBasedSubtitle;
    }
    return null;
  }

  private containsTextBasedSubtitles(streams: Stream[]): boolean {
    return streams.some((stream) => TextBasedSubtitleExtractor.isSupportedTextBasedSubtitleStream(stream));
  }

  private compareStreamsByLanguage(a: Stream, b: Stream, languagePriority: string[]): number {
    const aLang = a.tags.language ?? 'und';
    const bLang = b.tags.language ?? 'und';

    for (const language of languagePriority) {
      if (aLang === language) {
        return -1;
      }
      if (bLang === language) {
        return 1;
      }
    }

    return 0;
  }
}
