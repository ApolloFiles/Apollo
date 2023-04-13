import PlayerElement, { PlayerEvents } from './PlayerElement';

export default class NativePlayerElement extends PlayerElement {
  protected readonly videoElement: HTMLVideoElement;

  constructor(container: HTMLElement) {
    super(container);

    this.videoElement = document.createElement('video');
    this.videoElement.playsInline = true;
    this.videoElement.autoplay = true;
    this.container.appendChild(this.videoElement);
  }

  get currentTime(): number {
    return this.videoElement.currentTime;
  }

  set currentTime(time: number) {
    this.videoElement.currentTime = time;
  }

  get duration(): number {
    return this.videoElement.duration;
  }

  get playbackRate(): number {
    return this.videoElement.playbackRate;
  }

  set playbackRate(playbackRate: number) {
    this.videoElement.playbackRate = playbackRate;
  }

  get muted(): boolean {
    return this.videoElement.muted;
  }

  set muted(muted: boolean) {
    this.videoElement.muted = muted;
  }

  get volume(): number {
    return this.videoElement.volume;
  }

  set volume(volume: number) {
    this.videoElement.volume = volume;
  }

  get paused(): boolean {
    return this.videoElement.paused;
  }

  async loadMedia(src?: string, poster?: string): Promise<void> {
    this.videoElement.poster = poster ?? '';
    this.videoElement.src = src ?? '';
  }

  destroyPlayer(): void {
    this.videoElement.remove();
  }

  async play(): Promise<void> {
    return this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  getTextTracks(): TextTrack[] {
    return Array.from(this.videoElement.textTracks);
  }

  getBufferedRanges(): { start: number, end: number }[] {
    const bufferedRanges = [];
    for (let i = 0; i < this.videoElement.buffered.length; ++i) {
      bufferedRanges.push({
        start: this.videoElement.buffered.start(i),
        end: this.videoElement.buffered.end(i)
      });
    }
    return bufferedRanges;
  }

  addPassiveEventListener(event: PlayerEvents, listener: () => void): void {
    this.videoElement.addEventListener(event, listener, {passive: true});
  }
}
