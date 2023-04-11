import PlayerWrapper, { WrapperEvents } from './PlayerWrapper';

export default class YouTubePlayerWrapper implements PlayerWrapper {
  private readonly youtubePlayer: any;

  constructor(youtubePlayer: any) {
    this.youtubePlayer = youtubePlayer;
  }

  get currentTime(): number {
    return this.youtubePlayer.getCurrentTime();
  }

  set currentTime(time: number) {
    this.youtubePlayer.seekTo(time, true);
  }

  get duration(): number {
    return this.youtubePlayer.getDuration();
  }

  get playbackRate(): number {
    return this.youtubePlayer.getPlaybackRate();
  }

  set playbackRate(playbackRate: number) {
    this.youtubePlayer.setPlaybackRate(playbackRate);
  }

  get muted(): boolean {
    return this.youtubePlayer.isMuted();
  }

  set muted(muted: boolean) {
    if (muted) {
      this.youtubePlayer.mute();
      return;
    }

    this.youtubePlayer.unMute();
  }

  get volume(): number {
    return this.youtubePlayer.getVolume();
  }

  set volume(volume: number) {
    this.youtubePlayer.setVolume(volume);
  }

  get paused(): boolean {
    // @ts-ignore
    const pausedState = YT.PlayerState.PAUSED;
    return this.youtubePlayer.getPlayerState() === pausedState;
  }

  async play(): Promise<void> {
    this.youtubePlayer.playVideo();
  }

  pause(): void {
    this.youtubePlayer.pauseVideo();
  }

  getBufferedRanges(): { start: number; end: number }[] {
    return [];
  }

  prepareDestroy(): void {
    this.youtubePlayer.destroy();
  }

  addPassiveEventListener(event: WrapperEvents, listener: () => void): void {
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

    this.youtubePlayer.addEventListener(translatedEvent, translatedListener);
  }

  static async createYouTubePlayerAndWaitForReadyEvent(videoPlayerWrapper: HTMLElement, videoId: string, autoplay: boolean, uiLanguage: string): Promise<any> {
    // @ts-ignore
    const YouTubePlayer = YT.Player;

    return new Promise((resolve, reject) => {
      const ytPlayer = new YouTubePlayer(videoPlayerWrapper, {
        width: '100%',
        height: '100%',
        videoId,
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
}
