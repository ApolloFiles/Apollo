import { singleton } from 'tsyringe';
import type { AudioStream, Stream } from '../../../../video/analyser/VideoAnalyser.Types.js';
import AudioStreamArgumentsBuilder from './AudioStreamArgumentsBuilder.js';
import { BURN_IN_INPUT } from './BurnInInputs.js';

export type StreamArgumentsResult = {
  args: string[],
  varStreamMap: string[],
  audioNameMap: Map<string, string>,
  /** How many audio output streams the args map – the same count the per-stream input indices were assigned from */
  audioStreamCount: number,
}

@singleton()
export default class StreamArgumentsBuilder {
  constructor(
    private readonly audioStreamArgumentsBuilder: AudioStreamArgumentsBuilder,
  ) {
  }

  build(streamsToTranscode: Stream[], videoArgs: string[], burnInSubtitle: boolean): StreamArgumentsResult {
    const audioGroupName = 'audio';
    const varStreamMap: string[] = [];
    const audioNameMap = new Map<string, string>();
    const outputStreamCounter = { video: 0, audio: 0 };

    const result: string[] = [];
    for (const stream of streamsToTranscode) {
      if (stream.codecType === 'video') {
        result.push(...videoArgs);
        varStreamMap.push(`v:${outputStreamCounter.video++},agroup:${audioGroupName},name:video`);
        continue;
      }

      if (stream.codecType === 'audio') {
        const inputIndex = burnInSubtitle ? BURN_IN_INPUT.audio(outputStreamCounter.audio) : 0;
        result.push(...this.audioStreamArgumentsBuilder.build(stream as AudioStream, outputStreamCounter.audio, inputIndex));

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
      audioStreamCount: outputStreamCounter.audio,
    };
  }

  private stripNonSafeCharacters(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '');
  }
}
