import type { StartPlaybackResponse } from '../../../../../../../src/webserver/Api/v0/media/player-session/change-media';
import type VideoPlayerBackend from './backends/VideoPlayerBackend';
import VideoPlayerExtras from './VideoPlayerExtras.svelte';
import type { ReferencePlayerState } from './WebSocketClient.svelte';

type MediaMetadata = StartPlaybackResponse['mediaMetadata'];

export default class VideoPlayer {
  private readonly backend: VideoPlayerBackend;
  public readonly mediaMetadata: MediaMetadata;
  private readonly updatePlayerStateForBroadcast: (player: VideoPlayer, seeked: boolean, forceSend: boolean) => void;
  private readonly getReferencePlayerState: () => ReferencePlayerState | null;
  private readonly _playerExtras: VideoPlayerExtras;
  private readonly localBufferedRangesIntervalId: number;
  private readonly referencePlayerSyncIntervalId: number;

  private shouldShowCustomControls = $state(true);

  private currentTime = $state(0);
  private playbackRate = $state(1);
  private duration = $state(0);
  private volume = $state(1);
  private muted = $state(false);
  private isPlaying = $state(false);
  private activeAutoTrackId: string | null = $state(null);
  private audioTracks = $state<{ id: string, label: string }[]>([]);
  private activeSubtitleTrackId: string | null = $state(null);
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
  constructor(
    backend: VideoPlayerBackend,
    mediaMetadata: MediaMetadata,
    sessionId: string,
    updatePlayerStateForBroadcast: (player: VideoPlayer, seeked: boolean, forceSend: boolean) => void,
    getReferencePlayerState: () => ReferencePlayerState | null,
  ) {
    this.backend = backend;
    this.mediaMetadata = mediaMetadata;
    this.updatePlayerStateForBroadcast = updatePlayerStateForBroadcast;
    this.getReferencePlayerState = getReferencePlayerState;
    this._playerExtras = new VideoPlayerExtras(sessionId);

    this.shouldShowCustomControls = this.backend.shouldShowCustomControls;

    this.setupEventListeners();

    this.referencePlayerSyncIntervalId = window.setInterval(() => {
      this.updatePlayerStateForBroadcast(this, false, false);
      this.tickSynchronizationWithReferencePlayer();
    }, 1000);

    if (this.shouldShowCustomControls) {
      this.localBufferedRangesIntervalId = window.setInterval(() => {
        if (this.$isPlaying) {
          return;
        }

        this.localBufferedRanges = this.backend.getBufferedRanges();
      }, 250);
    } else {
      this.localBufferedRangesIntervalId = -1;
    }
  }

  get playerExtras(): VideoPlayerExtras {
    return this._playerExtras;
  }

  get $shouldShowCustomControls(): boolean {
    return this.shouldShowCustomControls;
  }

  get $currentTime(): number {
    return this.currentTime;
  }

  get $playbackRate(): number {
    return this.playbackRate;
  }

  set $playbackRate(rate: number) {
    this.backend.playbackRate = rate;
  }

  get $duration(): number {
    return this.duration;
  }

  get $volume(): number {
    return this.volume;
  }

  set $volume(volume: number) {
    this.backend.volume = volume;
  }

  get $muted(): boolean {
    return this.muted;
  }

  set $muted(muted: boolean) {
    this.backend.muted = muted;
  }

  get $isPlaying(): boolean {
    return this.isPlaying;
  }

  get $activeAudioTrackId(): string | null {
    return this.activeAutoTrackId;
  }

  set $activeAudioTrackId(trackId: string) {
    this.backend.setActiveAudioTrack(trackId);
  }

  get $audioTracks(): { id: string, label: string }[] {
    return this.audioTracks;
  }

  get $activeSubtitleTrackId(): string | null {
    return this.activeSubtitleTrackId;
  }

  set $activeSubtitleTrackId(trackId: string | null) {
    this.backend.setActiveSubtitleTrack(trackId);
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

  seek(time: number): void {
    this.backend.currentTime = time;
  }

  fastSeek(time: number): void {
    this.backend.fastSeek(time);
  }

  destroy(): void {
    window.clearInterval(this.localBufferedRangesIntervalId);
    window.clearInterval(this.referencePlayerSyncIntervalId);
    this.backend.destroy();
    this.playerExtras.destroy();
  }

  resetPlayerSynchronization(playbackRate: number): void {
    if (this.playbackRate !== playbackRate) {
      this.playbackRate = playbackRate;
    }
  }

  forceStateSynchronization(state: ReferencePlayerState['state']): void {
    if (state.paused && this.$isPlaying) {
      this.pause();
    }

    if (this.$playbackRate !== state.playbackRate) {
      this.$playbackRate = state.playbackRate;
    }

    if (this.currentTime !== state.currentTime) {
      this.seek(state.currentTime);
    }

    if (!state.paused && !this.$isPlaying) {
      this.play().catch(console.error);
    }
  }

  private tickSynchronizationWithReferencePlayer(): void {
    if (this.backend.isSeeking) {
      return;
    }

    const referenceState = this.getReferencePlayerState();
    if (referenceState == null) {
      return;
    }

    if (referenceState.state.paused) {
      this.forceStateSynchronization(referenceState.state);
      return;
    }

    const timeElapsed = Date.now() - referenceState.updated;
    const referenceTime = referenceState.state.currentTime + (timeElapsed / 1000);
    const currentAbsoluteTimeDifference = Math.abs(this.currentTime - referenceTime);

    if (currentAbsoluteTimeDifference > 10) {
      console.debug('Playback too far out-of-sync – Seeking...', {
        currentTime: this.currentTime,
        referenceTime,
        currentAbsoluteTimeDifference,
      });
      this.forceStateSynchronization({
        ...referenceState.state,
        currentTime: referenceTime,
      });
      return;
    }

    let targetPlaybackRate = referenceState.state.playbackRate;

    const currentlyHasASyncingRate = this.$playbackRate !== targetPlaybackRate;
    const deSyncThresholdForApplyingSyncingRate = currentlyHasASyncingRate ? 0.15 : 0.75;

    if (currentAbsoluteTimeDifference > deSyncThresholdForApplyingSyncingRate) {
      const rateOffset = currentAbsoluteTimeDifference > 5 ? 0.05 : 0.03;
      if (this.currentTime > referenceTime) {
        targetPlaybackRate -= rateOffset;
      } else {
        targetPlaybackRate += rateOffset;
      }
    }

    if (this.$playbackRate !== targetPlaybackRate) {
      console.debug('Adjusting playback rate... (Playback slightly out-of-sync?)', {
        currentAbsoluteTimeDifference,
        oldRate: this.$playbackRate,
        newRate: targetPlaybackRate,
      });
      this.$playbackRate = targetPlaybackRate;
    }
    this.play().catch(console.error);
  }

  private setupEventListeners(): void {
    this.backend.addPassiveEventListener('loadedmetadata', () => {
      this.duration = this.backend.duration;
      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();

      this.audioTracks = this.backend.getAudioTracks();
      this.subtitleTracks = this.backend.getSubtitleTracks();

      this.activeAutoTrackId = this.backend.getActiveAudioTrackId();
      this.activeSubtitleTrackId = this.backend.getActiveSubtitleTrackId();
    });
    this.backend.addPassiveEventListener('durationchange', () => {
      this.duration = this.backend.duration;

      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();
    });
    this.backend.addPassiveEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayerStateForBroadcast(this, false, true);
    });
    this.backend.addPassiveEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayerStateForBroadcast(this, false, true);
    });
    this.backend.addPassiveEventListener('ratechange', () => {
      this.playbackRate = this.backend.playbackRate;
    });
    this.backend.addPassiveEventListener('timeupdate', () => {
      this.currentTime = this.backend.currentTime;

      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();

      this.activeAutoTrackId = this.backend.getActiveAudioTrackId();
      this.activeSubtitleTrackId = this.backend.getActiveSubtitleTrackId();

      this.updatePlayerStateForBroadcast(this, false, false);
    });
    this.backend.addPassiveEventListener('volumechange', () => {
      this.volume = this.backend.volume;
      this.muted = this.backend.muted;
    });
    this.backend.addPassiveEventListener('progress', () => {
      this.localBufferedRanges = this.backend.getBufferedRanges();
      this.remoteBufferedRange = this.backend.getRemotelyBufferedRange();
    });
    this.backend.addPassiveEventListener('seeked', () => {
      this.updatePlayerStateForBroadcast(this, true, true);
    });
  }
}
