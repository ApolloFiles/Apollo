import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import {Media} from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import SubtitleTrack from '../subtitles/SubtitleTrack';
import PlayerElement, {AudioTrack, PlayerEvents} from './PlayerElement';

export default class YouTubePlayerElement extends PlayerElement {
  private static youTubeIframeApiLoaded = false;

  private ytPlayer?: any;

  constructor(container: HTMLElement) {
    super(container);
  }

  get currentTime(): number {
    return this.ytPlayer?.getCurrentTime() ?? 0;
  }

  set currentTime(time: number) {
    this.ytPlayer.seekTo(time, true);
  }

  get duration(): number {
    return this.ytPlayer?.getDuration() ?? 0;
  }

  get playbackRate(): number {
    return this.ytPlayer?.getPlaybackRate() ?? 1;
  }

  set playbackRate(playbackRate: number) {
    this.ytPlayer.setPlaybackRate(playbackRate);
  }

  get muted(): boolean {
    return this.ytPlayer?.isMuted() ?? true;
  }

  set muted(muted: boolean) {
    if (muted) {
      this.ytPlayer.mute();
      return;
    }

    this.ytPlayer.unMute();
  }

  get volume(): number {
    return this.ytPlayer?.getVolume() ?? 1;
  }

  set volume(volume: number) {
    this.ytPlayer.setVolume(volume);
  }

  get paused(): boolean {
    if (this.ytPlayer == null) {
      return true;
    }

    // @ts-ignore
    const pausedState = YT.PlayerState.PAUSED;
    return this.ytPlayer.getPlayerState() === pausedState;
  }

  async loadMedia(media: CommunicationProtocol.Media): Promise<void> {
    this.destroyPlayer();

    await YouTubePlayerElement.loadYouTubeIframeApi();
    this.ytPlayer = await YouTubePlayerElement.createYouTubePlayer(this.container, media.uri ?? null, true, 'en');
  }

  loadSubtitles(media: Media): void {
    if (media.metadata?.subtitles) {
      // no-op
      console.warn('Unable to load custom subtitles for YouTube player.');
    }
  }

  destroyPlayer(): void {
    this.ytPlayer?.destroy();
    this.ytPlayer = undefined;
  }

  async play(): Promise<void> {
    this.ytPlayer.playVideo();
  }

  pause(): void {
    this.ytPlayer.pauseVideo();
  }

  getAudioTracks(): AudioTrack[] {
    return [{id: 1, active: true, title: 'Default'}];
  }

  setAudioTrack(track: AudioTrack): void {
    // no-op
    console.warn('Changing audio tracks is not supported when using the YouTube player.');
  }

  getSubtitleTracks(): SubtitleTrack[] {
    return [];
  }

  addSubtitleTrack(track: SubtitleTrack): void {
    // no-op
    console.warn('Adding custom subtitles is not supported when using the YouTube player.');
  }

  clearSubtitleTracks(): void {
    // no-op
  }

  getBufferedRanges(): { start: number; end: number }[] {
    return [];
  }

  addPassiveEventListener(event: PlayerEvents, listener: () => void): void {
    let translatedEvent: string;
    let translatedListener: (event: { data: any }) => void = () => listener();

    switch (event) {
      case 'loadedmetadata':
        translatedEvent = 'onReady';
        break;

      case 'play':
        translatedEvent = 'onStateChange';
        translatedListener = (event: { data: any }) => {
          // @ts-ignore
          const playingState = YT.PlayerState.PLAYING;
          if (event.data === playingState) {
            listener();
          }
        };
        break;

      case 'pause':
        translatedEvent = 'onStateChange';
        translatedListener = (event: { data: any }) => {
          // @ts-ignore
          const pausedState = YT.PlayerState.PAUSED;
          if (event.data === pausedState) {
            listener();
          }
        };
        break;

      case 'ended':
        translatedEvent = 'onStateChange';
        translatedListener = (event: { data: any }) => {
          // @ts-ignore
          const endedState = YT.PlayerState.ENDED;
          if (event.data === endedState) {
            listener();
          }
        };
        break;

      case 'ratechange':
        translatedEvent = 'onPlaybackRateChange';
        break;

      case 'seeking':
      case 'seeked':
      case 'volumechange':
      case 'progress':
      case 'timeupdate':
      case 'durationchange':
      default:
        console.warn('The embedded YouTube player does not support the event:', event);
        return;
    }

    this.ytPlayer.addEventListener(translatedEvent, translatedListener);
  }

  private static async createYouTubePlayer(container: HTMLElement, videoId: string | null, autoplay: boolean, uiLanguage: string): Promise<any> {
    // @ts-ignore
    const YouTubePlayer = YT.Player;

    return new Promise((resolve, reject) => {
      const ytPlayer = new YouTubePlayer(container, {
        width: '100%',
        height: '100%',
        videoId: videoId ?? undefined,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          disablekb: 1,
          hl: uiLanguage,
          modestbranding: 1,
          playsinline: 1,
          rel: 0
        },
        events: {
          onReady: () => {
            resolve(ytPlayer);
          },
          onError: (event: { data: any }) => {
            reject(event.data);
          }
        }
      });
    });
  }

  private static async loadYouTubeIframeApi(): Promise<void> {
    if (this.youTubeIframeApiLoaded) {
      return;
    }
    this.youTubeIframeApiLoaded = true;

    return new Promise(async (resolve): Promise<void> => {
      (window as any).onYouTubeIframeAPIReady = () => {
        delete (window as any).onYouTubeIframeAPIReady;
        resolve();
      };

      await this.loadJs('https://www.youtube.com/iframe_api');
    });
  }
}
