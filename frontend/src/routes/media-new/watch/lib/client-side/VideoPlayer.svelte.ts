import type VideoPlayerBackend from './VideoPlayerBackend';

export default class VideoPlayer {
  private backend: VideoPlayerBackend;

  private currentTime = $state(0);
  private duration = $state(0);
  private volume = $state(1);
  private muted = $state(false);
  private isPlaying = $state(false);
  private audioTracks = $state<{ id: string, label: string }[]>([]);
  private subtitleTracks = $state<{ id: string, label: string }[]>([]);
  private localBufferedRanges = $state<{ start: number, end: number }[]>([]);
  private remoteBufferedRange = $state<{ start: number, end: number } | null>(null);

  private readonly localBufferedRangeToDisplay = $derived.by(() => {
    for (const { start, end } of this.localBufferedRanges) {
      if (this.currentTime >= start && this.currentTime <= end) {
        return { start, end };
      }
    }
    return null;
  });

  // TODO: make private?
  constructor(backend: VideoPlayerBackend) {
    this.backend = backend;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.backend.addPassiveEventListener('loadedmetadata', () => {
      console.log('event: loadedmetadata');
      this.duration = this.backend.duration;
      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();

      this.audioTracks = this.backend.getAudioTracks();
      this.subtitleTracks = this.backend.getSubtitleTracks();
    });
    this.backend.addPassiveEventListener('durationchange', () => {
      console.log('event: durationchange');
      this.duration = this.backend.duration;
      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();
    });
    this.backend.addPassiveEventListener('play', () => {
      console.log('event: play');
      this.isPlaying = true;
    });
    this.backend.addPassiveEventListener('pause', () => {
      console.log('event: pause');
      this.isPlaying = false;
    });
    this.backend.addPassiveEventListener('timeupdate', () => {
      console.log('event: timeupdate');
      this.currentTime = this.backend.currentTime;

      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();
    });
    this.backend.addPassiveEventListener('volumechange', () => {
      console.log('event: volumechange');
      this.volume = this.backend.volume;
      this.muted = this.backend.muted;
    });
    this.backend.addPassiveEventListener('progress', () => {
      console.log('event: progress');
      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();
    });
  }

  get $currentTime(): number {
    return this.currentTime;
  }

  get $duration(): number {
    return this.duration;
  }

  get $volume(): number {
    return this.volume;
  }

  get $muted(): boolean {
    return this.muted;
  }

  get $isPlaying(): boolean {
    return this.isPlaying;
  }

  get $audioTracks(): { id: string, label: string }[] {
    return this.audioTracks;
  }

  get $subtitleTracks(): { id: string; label: string }[] {
    return this.subtitleTracks;
  }

  get $localBufferedRanges(): { start: number, end: number }[] {
    return this.localBufferedRanges;
  }

  get $localBufferedRangeToDisplay(): { start: number, end: number } | null {
    return this.localBufferedRangeToDisplay;
  }

  get $remoteBufferedRange(): { start: number, end: number } | null {
    return this.remoteBufferedRange;
  }

  async play(): Promise<void> {
    await this.backend.play();
  }

  pause(): void {
    this.backend.pause();
  }

  setVolume(value: number): void {
    this.backend.volume = this.volume;
  }

  setMuted(value: boolean): void {
    this.backend.muted = value;
  }

  seek(time: number): void {
    this.backend.currentTime = time;
  }

  destroy(): void {
    this.backend.destroy();
  }
}
