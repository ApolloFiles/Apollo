import { singleton } from 'tsyringe';
import type { AudioStream, Stream, VideoStream } from '../../../../video/analyser/VideoAnalyser.Types';
import AudioStreamArgumentsBuilder from './AudioStreamArgumentsBuilder';
import VideoStreamArgumentsBuilder from './VideoStreamArgumentsBuilder';

export type TargetOptions = {
  readonly fps: number;
  readonly width: number;
  readonly segmentDuration: number;
}

export type StreamArgumentsResult = {
  args: string[],
  varStreamMap: string[],
  audioNameMap: Map<string, string>
}

@singleton()
export default class StreamArgumentsBuilder {
  constructor(
    private readonly audioStreamArgumentsBuilder: AudioStreamArgumentsBuilder,
    private readonly videoStreamArgumentsBuilder: VideoStreamArgumentsBuilder,
  ) {
  }

  async build(streamsToTranscode: Stream[], videoEncoder: string, targetOptions: TargetOptions): Promise<StreamArgumentsResult> {
    const audioGroupName = 'audio';
    const varStreamMap: string[] = [];
    const audioNameMap = new Map<string, string>();
    const outputStreamCounter = { video: 0, audio: 0 };

    const result: string[] = [];
    for (const stream of streamsToTranscode) {
      if (stream.codecType === 'video') {
        result.push(...this.videoStreamArgumentsBuilder.build(stream as VideoStream, streamsToTranscode, targetOptions, videoEncoder));
        varStreamMap.push(`v:${outputStreamCounter.video++},agroup:${audioGroupName},name:video`);
        continue;
      }

      if (stream.codecType === 'audio') {
        result.push(...this.audioStreamArgumentsBuilder.build(stream as AudioStream));

        // ISO 639-2 language code (https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes)
        // FIXME: audio stream names do not work
        varStreamMap.push(`a:${outputStreamCounter.audio++},agroup:${audioGroupName},name:${audioGroupName}_${outputStreamCounter.audio},language:${this.stripNonSafeCharacters(stream.tags.language ?? '') || 'und'},default:${outputStreamCounter.audio === 1 ? 'yes' : 'no'}`);
        // TODO: if no title is available, map the language to a full name and ultimately fallback to 'Audio #1' etc.
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

  private stripNonSafeCharacters(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private stripNonAlphaChars(str: string): string {
    return str.replace(/[^a-zA-Z]/g, '');
  }
}
