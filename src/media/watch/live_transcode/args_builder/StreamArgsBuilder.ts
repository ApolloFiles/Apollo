import { AudioStream, Stream, VideoStream } from '../../../video/analyser/VideoAnalyser.Types';
import AudioEncoderArgsBuilder from './AudioEncoderArgsBuilder';
import VideoEncoderArgsBuilder, { TargetOptions } from './VideoEncoderArgsBuilder';

export default class StreamArgsBuilder {
  static async buildArgsForStreams(streamsToTranscode: Stream[], videoEncoder: string, targetOptions: TargetOptions): Promise<{
    args: string[],
    varStreamMap: string[],
    audioNameMap: Map<string, string>
  }> {
    const audioGroupName = 'audio';
    const varStreamMap: string[] = [];
    const audioNameMap = new Map<string, string>();
    const outputStreamCounter = { video: 0, audio: 0 };

    const result: string[] = [];
    for (const stream of streamsToTranscode) {
      if (stream.codecType == 'video') {
        result.push(...VideoEncoderArgsBuilder.buildArgs(stream as VideoStream, streamsToTranscode, targetOptions, videoEncoder));
        varStreamMap.push(`v:${outputStreamCounter.video++},agroup:${audioGroupName},name:video`);
        continue;
      }

      if (stream.codecType == 'audio') {
        result.push(...AudioEncoderArgsBuilder.buildArgs(stream as AudioStream));

        // ISO 639-2 language code (https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes)
        varStreamMap.push(`a:${outputStreamCounter.audio++},agroup:${audioGroupName},name:${audioGroupName}_${outputStreamCounter.audio},language:${this.stripNonAlphaChars(stream.tags.language ?? '') || 'und'},default:${outputStreamCounter.audio == 1 ? 'yes' : 'no'}`);
        audioNameMap.set(`audio_${outputStreamCounter.audio}`, `${(stream.tags.title ?? stream.tags.language) || 'und'}`);
        continue;
      }
    }

    return {
      args: result,
      varStreamMap,
      audioNameMap,
    };
  }

  private static stripNonAlphaChars(str: string): string {
    return str.replace(/[^a-zA-Z]/g, '');
  }
}
