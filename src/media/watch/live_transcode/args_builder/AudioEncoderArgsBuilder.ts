import {AudioStream} from '../../../video/analyser/VideoAnalyser.Types';

export default class AudioEncoderArgsBuilder {
  static buildArgs(audioStream: AudioStream): string[] {
    const targetChannelCount = Math.min(audioStream.channels, 2);
    const targetSampleRate = targetChannelCount <= 2 ? 44100 : 48000;

    // TODO: Check https://websites.fraunhofer.de/video-dev/why-and-how-to-align-media-segments-for-abr-streaming/ for segmentDuration
    return [
      '-map', `0:${audioStream.index}`,

      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', targetChannelCount.toString(),
      '-ar', targetSampleRate.toString()
    ];
  }
}
