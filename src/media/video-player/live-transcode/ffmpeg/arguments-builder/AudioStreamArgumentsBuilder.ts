import { singleton } from 'tsyringe';
import type { AudioStream } from '../../../../video/analyser/VideoAnalyser.Types';

@singleton()
export default class AudioStreamArgumentsBuilder {
  build(audioStream: AudioStream): string[] {
    const targetChannelCount = Math.min(audioStream.channels, 2);
    const targetSampleRate = targetChannelCount <= 2 ? 44100 : 48000;

    // TODO: Check https://websites.fraunhofer.de/video-dev/why-and-how-to-align-media-segments-for-abr-streaming/ for segmentDuration
    return [
      '-map', `0:${audioStream.index}`,

      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', targetChannelCount.toString(),
      '-ar', targetSampleRate.toString(),
    ];
  }
}
