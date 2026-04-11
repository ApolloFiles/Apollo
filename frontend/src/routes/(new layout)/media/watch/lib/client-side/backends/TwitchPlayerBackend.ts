import type SubtitleTrack from './subtitles/SubtitleTrack';
import VideoPlayerBackend, { type BackendOptions, type PlayerEvent } from './VideoPlayerBackend';

export interface TwitchPlayerBackendOptions extends BackendOptions {
  backend: {
    channelName: string;
  };
}

export default class TwitchPlayerBackend<T extends TwitchPlayerBackendOptions = TwitchPlayerBackendOptions> extends VideoPlayerBackend<T> {
  private static twitchEmbedApiLoaded = false;

  public readonly shouldShowCustomControls = false;
  public readonly backendOptions: T;

  private readonly backendReadyPromise: Promise<void>;
  private twitchPlayer?: any;

  protected constructor(container: HTMLDivElement, options: T) {
    super();
    this.backendOptions = options;

    container = container.appendChild(document.createElement('div'));

    this.backendReadyPromise = new Promise(async (resolve, reject): Promise<void> => {
      try {
        await TwitchPlayerBackend.loadTwitchEmbedApi();
        this.twitchPlayer = TwitchPlayerBackend.createTwitchPlayer(container, options.backend.channelName);
        // @ts-ignore
        this.twitchPlayer.addEventListener(Twitch.Player.READY, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  get playbackRate(): number {
    return 1;
  }

  set playbackRate(_value: number) {
    // Twitch live streams do not support changing playback rate
  }

  get volume(): number {
    return this.twitchPlayer?.getVolume() ?? 1;
  }

  set volume(value: number) {
    this.twitchPlayer?.setVolume(value);
  }

  get muted(): boolean {
    return this.twitchPlayer?.getMuted() ?? true;
  }

  set muted(value: boolean) {
    if (value) {
      this.twitchPlayer?.setMuted(true);
    } else {
      this.twitchPlayer?.setMuted(false);
    }
  }

  get currentTime(): number {
    return this.twitchPlayer?.getCurrentTime() ?? 0;
  }

  get duration(): number {
    return this.twitchPlayer?.getDuration() ?? 0;
  }

  get isSeeking(): boolean {
    return false;
  }

  async play(): Promise<void> {
    this.twitchPlayer?.play();
  }

  pause(): void {
    this.twitchPlayer?.pause();
  }

  seek(time: number, _stillSeeking = false): void {
    this.twitchPlayer?.seek(time);
  }

  fastSeek(time: number, _stillSeeking = false): void {
    this.twitchPlayer?.seek(time);
  }

  getActiveAudioTrackId(): string | null {
    return 'default';
  }

  setActiveAudioTrack(_id: string): void {
    // no-op
  }

  getAudioTracks(): { id: string, label: string }[] {
    return [{ id: 'default', label: 'Default' }];
  }

  getSubtitleTracks(): ReadonlyArray<SubtitleTrack> {
    return [];
  }

  addSubtitleTrack(_subtitleTrack: SubtitleTrack): void {
    // no-op
  }

  getActiveSubtitleTrack(): SubtitleTrack | null {
    return null;
  }

  setActiveSubtitleTrack(_subtitleTrackId: string | null): void {
    // no-op
  }

  getBufferedRanges(): { start: number, end: number }[] {
    return [];
  }

  getRemotelyBufferedRange(): { start: number, end: number } | null {
    return null;
  }

  addPassiveEventListener(event: PlayerEvent, listener: () => void): void {
    let translatedEvent: string;

    switch (event) {
      case 'loadedmetadata':
        // @ts-ignore
        translatedEvent = Twitch.Player.READY;
        break;
      case 'play':
        // @ts-ignore
        translatedEvent = Twitch.Player.PLAY;
        break;
      case 'pause':
        // @ts-ignore
        translatedEvent = Twitch.Player.PAUSE;
        break;
      case 'ended':
        // @ts-ignore
        translatedEvent = Twitch.Player.ENDED;
        break;
      case 'seeked':
        // @ts-ignore
        translatedEvent = Twitch.Player.SEEK;
        break;
      case 'seeking':
      case 'timeupdate':
      case 'durationchange':
      case 'volumechange':
      case 'progress':
      case 'ratechange':
      default:
        console.warn('The embedded Twitch player does not support the event:', event);
        return;
    }

    this.twitchPlayer.addEventListener(translatedEvent, listener);
  }

  destroy(): void {
    this.twitchPlayer?.destroy();
    this.twitchPlayer = undefined;
  }

  protected async waitForPlayerBackendReady(): Promise<void> {
    return this.backendReadyPromise;
  }

  static async create(container: HTMLDivElement, options: TwitchPlayerBackendOptions): Promise<TwitchPlayerBackend> {
    const backend = new TwitchPlayerBackend(container, options);
    await backend.waitForPlayerBackendReady();
    return backend;
  }

  private static createTwitchPlayer(container: HTMLElement, channelName: string): any {
    // @ts-ignore
    const TwitchPlayer = Twitch.Player;
    return new TwitchPlayer(container, {
      width: '100%',
      height: '100%',
      channel: channelName,
      autoplay: true,
      parent: [window.location.hostname],
    });
  }

  private static async loadTwitchEmbedApi(): Promise<void> {
    if (this.twitchEmbedApiLoaded) {
      return;
    }
    this.twitchEmbedApiLoaded = true;

    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('src', 'https://player.twitch.tv/js/embed/v1.js');
      scriptElement.addEventListener('load', () => resolve());
      scriptElement.addEventListener('error', () => reject(new Error('Unable to load Twitch Embed API')));
      document.querySelector('head')!.appendChild(scriptElement);
    });
  }
}
