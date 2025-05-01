import VideoPlayerBackend, { type BackendOptions, type PlayerEvent } from './VideoPlayerBackend';

export interface HtmlVideoPlayerBackendOptions extends BackendOptions {
  backend: {
    src: string
  };
}

export default class HtmlVideoPlayerBackend<T extends HtmlVideoPlayerBackendOptions = HtmlVideoPlayerBackendOptions> extends VideoPlayerBackend<T> {
  public readonly shouldShowCustomControls = true;
  public readonly backendOptions: T;  // TODO: Should we really have this field? Maybe the layer that needs it should just take it themselves from the constructor

  protected readonly videoElement: HTMLVideoElement;

  protected constructor(container: HTMLDivElement, options: T) {
    super();
    this.backendOptions = options;

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.src = options.backend.src;
    container.appendChild(this.videoElement);
  }

  get currentTime(): number {
    return this.videoElement.currentTime;
  }

  set currentTime(value: number) {
    this.videoElement.currentTime = value;
  }

  get volume(): number {
    return this.videoElement.volume;
  }

  set volume(value: number) {
    this.videoElement.volume = value;
  }

  get muted(): boolean {
    return this.videoElement.muted;
  }

  set muted(value: boolean) {
    this.videoElement.muted = value;
  }

  get duration(): number {
    return this.videoElement.duration;
  }

  async play(): Promise<void> {
    await this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  fastSeek(time: number): void {
    this.videoElement.currentTime = time;
  }

  getActiveAudioTrackId(): string | null {
    return null;
  }

  setActiveAudioTrack(id: string): void {
    // TODO
  }

  getAudioTracks(): { id: string, label: string }[] {
    return [{ id: '1', label: 'Default' }];
  }

  getActiveSubtitleTrackId(): string | null {
    return null;
  }

  setActiveSubtitleTrack(id: string | null): void {
    // TODO
  }

  getSubtitleTracks(): { id: string, label: string }[] {
    return Array.from(this.videoElement.textTracks).map(track => {
      return {
        id: track.id,
        label: track.label,
      };
    });
  }

  getBufferedRanges(): { start: number, end: number }[] {
    const currentlyBuffered = this.videoElement.buffered;

    const bufferedRanges = [];
    for (let i = 0; i < currentlyBuffered.length; ++i) {
      bufferedRanges.push({
        start: currentlyBuffered.start(i),
        end: currentlyBuffered.end(i),
      });
    }
    return bufferedRanges;
  }

  getRemotelyBufferedRange(): { start: number, end: number } | null {
    return null;
  }

  destroy(): void {
    this.videoElement.remove();
  }

  addPassiveEventListener(event: PlayerEvent, listener: () => void): void {
    this.videoElement.addEventListener(event, listener, { passive: true });
  }

  protected async waitForPlayerBackendReady(): Promise<void> {
    // no-op
  }

  static async create(container: HTMLDivElement, options: HtmlVideoPlayerBackendOptions): Promise<HtmlVideoPlayerBackend> {
    return new HtmlVideoPlayerBackend(container, options);
  }
}
