import { singleton } from 'tsyringe';
import type { AudioStream } from '../../../../video/analyser/VideoAnalyser.Types.js';

@singleton()
export default class AudioStreamArgumentsBuilder {
  build(audioStream: AudioStream, outputAudioIndex: number): string[] {
    const targetChannelCount = Math.min(audioStream.channels, 2);
    const targetSampleRate = targetChannelCount <= 2 ? 44100 : 48000;

    // Scope every option to this specific output audio stream (`:a:<index>`); otherwise
    // ffmpeg applies these stream-type-wide options to *all* audio outputs and warns that
    // only the last one specified is used.
    // TODO: Check https://websites.fraunhofer.de/video-dev/why-and-how-to-align-media-segments-for-abr-streaming/ for segmentDuration
    return [
      '-map', `0:${audioStream.index}`,

      `-c:a:${outputAudioIndex}`, 'aac',
      `-b:a:${outputAudioIndex}`, '128k',
      `-ac:a:${outputAudioIndex}`, targetChannelCount.toString(),
      `-ar:a:${outputAudioIndex}`, targetSampleRate.toString(),
    ];
  }
}
