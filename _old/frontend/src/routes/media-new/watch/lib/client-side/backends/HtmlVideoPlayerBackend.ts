import type { StartPlaybackResponse } from '../../../../../../../../src/webserver/Api/v0/media/player-session/change-media';
import AssSubtitleTrack from './subtitles/AssSubtitleTrack';
import NativeSubtitleTrack from './subtitles/NativeSubtitleTrack';
import type SubtitleTrack from './subtitles/SubtitleTrack';
import VideoPlayerBackend, { type BackendOptions, type PlayerEvent } from './VideoPlayerBackend';

export interface HtmlVideoPlayerBackendOptions extends BackendOptions {
  backend: {
    src: string,
    subtitles?: StartPlaybackResponse['additionalStreams']['subtitles'],
  };
}

export default class HtmlVideoPlayerBackend<T extends HtmlVideoPlayerBackendOptions = HtmlVideoPlayerBackendOptions> extends VideoPlayerBackend<T> {
  public readonly shouldShowCustomControls = true;
  public readonly backendOptions: T;  // TODO: Should we really have this field? Maybe the layer that needs it should just take it themselves from the constructor

  protected readonly videoElement: HTMLVideoElement;
  protected readonly subtitleTracks: SubtitleTrack[] = [];
  protected activeSubtitleTrack: SubtitleTrack | null = null;

  protected constructor(container: HTMLDivElement, options: T) {
    super();
    this.backendOptions = options;

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.src = options.backend.src;
    container.appendChild(this.videoElement);

    if (options.backend.subtitles) {
      for (let i = 0; i < options.backend.subtitles.length; ++i) {
        const subtitleId = i.toString();
        const subtitle = options.backend.subtitles[i];

        if (subtitle.codecName === 'webvtt') {
          this.addSubtitleTrack(new NativeSubtitleTrack(subtitleId, subtitle.title, subtitle.language, subtitle.uri, this.videoElement));
          continue;
        }
        if (subtitle.codecName === 'ass' || subtitle.codecName === 'ssa') {
          this.addSubtitleTrack(new AssSubtitleTrack(subtitleId, subtitle.title, subtitle.language, subtitle.uri, subtitle.fonts, this.videoElement));
          continue;
        }

        console.warn('Ignoring subtitle with unsupported codecName:', subtitle);
      }
    }
  }

  get playbackRate(): number {
    return this.videoElement.playbackRate;
  }

  set playbackRate(value: number) {
    this.videoElement.playbackRate = value;
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

  get currentTime(): number {
    return this.videoElement.currentTime;
  }

  get duration(): number {
    return this.videoElement.duration;
  }

  get isSeeking(): boolean {
    return this.videoElement.seeking;
  }

  async play(): Promise<void> {
    await this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  seek(time: number, _stillSeeking: boolean): void {
    this.videoElement.currentTime = time;
  }

  fastSeek(time: number, _stillSeeking: boolean): void {
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

  getSubtitleTracks(): ReadonlyArray<SubtitleTrack> {
    return this.subtitleTracks;
  }

  addSubtitleTrack(subtitleTrack: SubtitleTrack): void {
    if (this.subtitleTracks.some((track) => track.id === subtitleTrack.id)) {
      console.error('Subtitle track with the same ID already exists (ignoring it):', subtitleTrack.id);
      return;
    }

    this.subtitleTracks.push(subtitleTrack);
  }

  getActiveSubtitleTrack(): SubtitleTrack | null {
    return this.activeSubtitleTrack;
  }

  setActiveSubtitleTrack(subtitleTrackId: string | null): void {
    this.activeSubtitleTrack?.deactivate();
    this.activeSubtitleTrack = null;

    if (subtitleTrackId != null) {
      const subtitleTrack = this.subtitleTracks.find((track) => track.id === subtitleTrackId);
      if (subtitleTrack) {
        this.activeSubtitleTrack = subtitleTrack;
        subtitleTrack.activate();
      } else {
        console.error('No subtitle track found with ID:', subtitleTrackId);
      }
    }
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
    this.activeSubtitleTrack?.deactivate();
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
