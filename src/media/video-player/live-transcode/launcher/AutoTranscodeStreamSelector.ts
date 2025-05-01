import { singleton } from 'tsyringe';
import { ExtendedVideoAnalysis, Stream } from '../../../video/analyser/VideoAnalyser.Types';
import TextBasedSubtitleExtractor from '../../../watch/live_transcode/extractor/TextBasedSubtitleExtractor';

// FIXME: Give user more control about stream selection
@singleton()
export default class AutoTranscodeStreamSelector {
  selectStreams(videoAnalysis: ExtendedVideoAnalysis): Stream[] {
    const firstVideoStream = videoAnalysis.streams.find(stream => stream.codecType === 'video');
    if (firstVideoStream == null) {
      throw new Error('No video stream found');
    }

    const audioStreams = videoAnalysis.streams.filter(stream => stream.codecType === 'audio');
    audioStreams.sort((a, b) => this.compareStreamsByLanguage(a, b, ['jpn', 'eng', 'deu']));

    const subtitleStreams = videoAnalysis.streams.filter(stream => stream.codecType === 'subtitle');
    subtitleStreams.sort((a, b) => this.compareStreamsByLanguage(a, b, ['deu', 'eng']));

    const shouldTranscodeImageBasedSubtitles = subtitleStreams.length > 0 && !this.containsTextBasedSubtitles(videoAnalysis.streams);

    const streamsToTranscode = [firstVideoStream];
    if (audioStreams.length > 0) {
      streamsToTranscode.push(...audioStreams);

      if (shouldTranscodeImageBasedSubtitles && (audioStreams[0].tags.language === 'jpn' || audioStreams[0].tags.language === 'und')) {
        streamsToTranscode.push(subtitleStreams[0]);
      }
    } else if (shouldTranscodeImageBasedSubtitles) {
      streamsToTranscode.push(subtitleStreams[0]);
    }

    return streamsToTranscode;
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
