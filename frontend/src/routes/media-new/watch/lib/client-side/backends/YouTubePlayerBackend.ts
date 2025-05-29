import VideoPlayerBackend, { type BackendOptions, type PlayerEvent } from './VideoPlayerBackend';

export interface YouTubePlayerBackendOptions extends BackendOptions {
  backend: {
    videoUrlOrId: string
  };
}

export default class YouTubePlayerBackend<T extends YouTubePlayerBackendOptions = YouTubePlayerBackendOptions> extends VideoPlayerBackend<T> {
  private static youTubeIframeApiLoaded = false;

  public readonly shouldShowCustomControls = false;
  public readonly backendOptions: T;

  private readonly backendReadyPromise: Promise<void>;
  private ytPlayer?: any;

  protected constructor(container: HTMLDivElement, options: T) {
    super();
    this.backendOptions = options;

    container = container.appendChild(document.createElement('div'));

    this.backendReadyPromise = new Promise(async (resolve, reject): Promise<void> => {
      const videoInfo = YouTubePlayerBackend.extractVideoInfoFromInput(options.backend.videoUrlOrId);
      if (videoInfo == null) {
        reject(new Error('Invalid video URL or ID: ' + options.backend.videoUrlOrId));
        return;
      }

      await YouTubePlayerBackend.loadYouTubeIframeApi();
      this.ytPlayer = await YouTubePlayerBackend.createYouTubePlayer(container, videoInfo.videoId, videoInfo.startSeconds);
      resolve();
    });
  }

  get currentTime(): number {
    return this.ytPlayer?.getCurrentTime() ?? 0;
  }

  set currentTime(value: number) {
    this.ytPlayer.seekTo(value, true);
  }

  get playbackRate(): number {
    return this.ytPlayer?.getPlaybackRate() ?? 1;
  }

  set playbackRate(value: number) {
    this.ytPlayer.setPlaybackRate(value);
  }

  get volume(): number {
    return this.ytPlayer?.getVolume() ?? 1;
  }

  set volume(value: number) {
    this.ytPlayer.setVolume(value);
  }

  get muted(): boolean {
    return this.ytPlayer?.isMuted() ?? true;
  }

  set muted(value: boolean) {
    if (value) {
      this.ytPlayer.mute();
      return;
    }

    this.ytPlayer.unMute();
  }

  get duration(): number {
    return this.ytPlayer?.getDuration() ?? 0;
  }

  get isSeeking(): boolean {
    return false;
  }

  async play(): Promise<void> {
    this.ytPlayer.playVideo();
  }

  pause(): void {
    this.ytPlayer.pauseVideo();
  }

  fastSeek(time: number): void {
    this.ytPlayer.seekTo(time, true);
  }

  getActiveAudioTrackId(): string | null {
    return '1';
  }

  setActiveAudioTrack(id: string): void {
    // no-op
  }

  getAudioTracks(): { id: string, label: string }[] {
    return [{ id: '1', label: 'Default' }];
  }

  getActiveSubtitleTrackId(): string | null {
    return null;
  }

  setActiveSubtitleTrack(id: string | null): void {
    // no-op
  }

  getSubtitleTracks(): { id: string, label: string }[] {
    return [];
  }

  getBufferedRanges(): { start: number, end: number }[] {
    return [];
  }

  getRemotelyBufferedRange(): { start: number, end: number } | null {
    return null;
  }

  destroy(): void {
    this.ytPlayer?.destroy();
    this.ytPlayer = undefined;
  }

  addPassiveEventListener(event: PlayerEvent, listener: () => void): void {
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

  protected async waitForPlayerBackendReady(): Promise<void> {
    return this.backendReadyPromise;
  }

  static async create(container: HTMLDivElement, options: YouTubePlayerBackendOptions): Promise<YouTubePlayerBackend> {
    const backend = new YouTubePlayerBackend(container, options);
    await backend.waitForPlayerBackendReady();
    return backend;
  }

  private static extractVideoInfoFromInput(input: string): { videoId: string, startSeconds?: number } | null {
    input = input.trim();
    if (input === '') {
      return null;
    }

    if (/^https?:\/\/youtu\.be\//i.test(input)) {
      const videoId = new URL(input).pathname.substring(1);
      const startSeconds = new URL(input).searchParams.get('t') ?? '0';
      return { videoId, startSeconds: Math.max(0, parseInt(startSeconds, 10)) };
    }

    if (/^https?:\/\/(?:(?:www|music|m)\.)?youtube\.com\/watch/i.test(input)) {
      const videoId = new URL(input).searchParams.get('v');
      if (videoId == null) {
        return null;
      }

      const startSeconds = new URL(input).searchParams.get('t') ?? '0';
      return { videoId, startSeconds: Math.max(0, parseInt(startSeconds, 10)) };
    }

    if (/^https?:\/\/(?:www\.)?youtube\.com\/short/i.test(input)) {
      const videoId = new URL(input).pathname.substring(7);
      return videoId == null ? null : { videoId };
    }

    return { videoId: input };
  }

  private static async createYouTubePlayer(container: HTMLElement, videoId: string, startSeconds?: number): Promise<any> {
    // @ts-ignore
    const YouTubePlayer = YT.Player;

    return new Promise((resolve, reject) => {
      const ytPlayer = new YouTubePlayer(container, {
        width: '100%',
        height: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          disablekb: 0, // disable keyboard controls
          hl: 'en',
          rel: 0,
          start: startSeconds,
        },
        events: {
          onReady: () => {
            resolve(ytPlayer);
          },
          onError: (event: { data: any }) => {
            reject(event.data);
          },
        },
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

      await this.loadJsScript('https://www.youtube.com/iframe_api');
    });
  }

  private static async loadJsScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('src', url);
      scriptElement.addEventListener('load', () => resolve());
      scriptElement.addEventListener('error', () => reject(new Error('Unable to load script: ' + url)));

      document.querySelector('head')!.appendChild(scriptElement);
    });
  }
}
