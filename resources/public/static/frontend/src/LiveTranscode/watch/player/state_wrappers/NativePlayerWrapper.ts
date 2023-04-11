import PlayerWrapper, { WrapperEvents } from './PlayerWrapper';

export default class NativePlayerWrapper implements PlayerWrapper {
  private readonly videoElement: HTMLVideoElement;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
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

  async play(): Promise<void> {
    return this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  getBufferedRanges(): { start: number; end: number }[] {
    const bufferedRanges = [];
    for (let i = 0; i < this.videoElement.buffered.length; ++i) {
      bufferedRanges.push({
        start: this.videoElement.buffered.start(i),
        end: this.videoElement.buffered.end(i)
      });
    }
    return bufferedRanges;
  }

  prepareDestroy(): void {
    // nothing to do
  }

  addPassiveEventListener(event: WrapperEvents, listener: () => void): void {
    this.videoElement.addEventListener(event, listener, {passive: true});
  }
}
