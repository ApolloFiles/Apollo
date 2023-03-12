import VideoElementWrapper from './VideoElementWrapper';

export default class HTMLVideoElementWrapper implements VideoElementWrapper {
  protected readonly videoElement: HTMLVideoElement;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  get volume(): number {
    return this.videoElement.volume;
  }

  set volume(volume: number) {
    this.videoElement.volume = volume;
  }

  get muted(): boolean {
    return this.videoElement.muted;
  }

  set muted(muted: boolean) {
    this.videoElement.muted = muted;
  }

  get playbackRate(): number {
    return this.videoElement.playbackRate;
  }

  set playbackRate(playbackRate: number) {
    this.videoElement.playbackRate = playbackRate;
  }

  get currentTime(): number {
    return this.videoElement.currentTime;
  }

  get duration(): number {
    return this.videoElement.duration;
  }

  get paused(): boolean {
    return this.videoElement.paused;
  }

  get ended(): boolean {
    return this.videoElement.ended;
  }

  async loadMedia(mediaUri: string): Promise<void> {
    this.videoElement.src = mediaUri;
  }

  play(): Promise<void> {
    return this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  seek(time: number): void {
    this.videoElement.currentTime = time;
  }

  destroyWrapper(): void {
    // Nothing to do here
  }

  // on<K extends keyof HTMLVideoElementEventMap>(type: 'durationchange', listener: (this: HTMLVideoElement, ev: HTMLVideoElementEventMap[K] | Event) => any, options?: { passive: boolean }): this {
  //   this.videoElement.addEventListener(type, listener, options);
  //   return this;
  // }
}
