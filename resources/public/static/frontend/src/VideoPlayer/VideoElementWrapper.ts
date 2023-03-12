export default interface VideoElementWrapper {
  get volume(): number;
  set volume(volume: number);

  get muted(): boolean;
  set muted(muted: boolean);

  get playbackRate(): number;
  set playbackRate(playbackRate: number);

  get currentTime(): number;

  get duration(): number;

  get paused(): boolean;
  get ended(): boolean;

  loadMedia(mediaUri: string): Promise<void>;
  getLoadedMediaUri(): string | null;

  play(): Promise<void>;
  pause(): void;

  seek(time: number): void;

  destroyWrapper(): void;
  // on(type: 'durationchange', listener: () => void): this;
}
