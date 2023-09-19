import {AudioStream, Stream, VideoStream} from '../../../video/analyser/VideoAnalyser.Types';
import AudioEncoderArgsBuilder from './AudioEncoderArgsBuilder';
import VideoEncoderArgsBuilder, {TargetOptions} from './VideoEncoderArgsBuilder';

export default class StreamArgsBuilder {
  static async buildArgsForStreams(streamsToTranscode: Stream[], videoEncoder: string, targetOptions: TargetOptions): Promise<{
    args: string[],
    varStreamMap: string[]
  }> {
    const audioGroupName = 'audio';
    const varStreamMap: string[] = [];
    const outputStreamCounter = {video: 0, audio: 0};

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
        varStreamMap.push(`a:${outputStreamCounter.audio++},agroup:${audioGroupName},name:${stream.tags.language ?? 'und'},language:${stream.tags.language ?? 'und'},default:${outputStreamCounter.audio == 1 ? 'yes' : 'no'}`);
        continue;
      }
    }

    return {
      args: result,
      varStreamMap
    };
  }
}
