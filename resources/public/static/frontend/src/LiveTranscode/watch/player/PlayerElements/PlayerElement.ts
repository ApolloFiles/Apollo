import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import ApolloVideoPlayer from '../ApolloVideoPlayer';
import SubtitleTrack from '../subtitles/SubtitleTrack';

export type PlayerEvents = 'loadedmetadata'
                           | 'play'
                           | 'pause'
                           | 'ended'

                           | 'volumechange'

                           | 'timeupdate'
                           | 'durationchange'
                           | 'progress'
                           | 'ratechange'

                           | 'seeking'
                           | 'seeked';

export type AudioTrack = {
  readonly id: number;
  readonly active: boolean;
  readonly title: string;
  readonly lang?: string;
}

export default abstract class PlayerElement {
  protected readonly container: HTMLElement;

  protected constructor(container: HTMLElement) {
    this.container = container;
  }

  abstract get currentTime(): number;
  abstract set currentTime(time: number);

  abstract get duration(): number;

  abstract get playbackRate(): number;
  abstract set playbackRate(playbackRate: number);

  abstract get muted(): boolean;
  abstract set muted(muted: boolean);

  abstract get volume(): number;
  abstract set volume(volume: number);

  abstract get paused(): boolean;

  abstract loadMedia(media: CommunicationProtocol.Media): Promise<void>;

  abstract loadSubtitles(media: CommunicationProtocol.Media, videoPlayer: ApolloVideoPlayer): void;

  abstract loadSeekThumbnails(media: CommunicationProtocol.Media, videoPlayer: ApolloVideoPlayer): void;

  abstract destroyPlayer(): void;

  abstract play(): Promise<void>;

  abstract pause(): void;

  abstract getAudioTracks(): AudioTrack[];

  abstract setAudioTrack(track: AudioTrack): void;

  abstract setAudioTrackNameMapping(mapping: { [key: string]: string }): void;

  abstract getSubtitleTracks(): SubtitleTrack[];

  abstract addSubtitleTrack(track: SubtitleTrack): void;

  abstract clearSubtitleTracks(): void;

  abstract getBufferedRanges(): { start: number, end: number }[];

  abstract addPassiveEventListener(event: PlayerEvents, listener: () => void): void;

  protected static async loadJs(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('src', url);
      scriptElement.addEventListener('load', () => resolve());
      scriptElement.addEventListener('error', () => reject(new Error('Unable to load script: ' + url)));

      document.querySelector('head')!.appendChild(scriptElement);
    });
  }
}
