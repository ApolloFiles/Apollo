import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import ApolloVideoPlayer from '../ApolloVideoPlayer';
import AssSubtitleTrack from '../subtitles/AssSubtitleTrack';
import NativeSubtitleTrack from '../subtitles/NativeSubtitleTrack';
import SubtitleTrack from '../subtitles/SubtitleTrack';
import PlayerElement, { AudioTrack, PlayerEvents } from './PlayerElement';

export default class NativePlayerElement extends PlayerElement {
  protected readonly videoElement: HTMLVideoElement;
  protected readonly audioTrackNameMapping = new Map<string, string>();
  private readonly subtitleTracks: SubtitleTrack[] = [];

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

  async loadMedia(media: CommunicationProtocol.Media): Promise<void> {
    this.videoElement.poster = media.metadata?.posterUri ?? '';
    this.videoElement.src = media.uri ?? '';
  }

  loadSubtitles(media: CommunicationProtocol.Media, videoPlayer: ApolloVideoPlayer): void {
    if (media.metadata?.subtitles == null) {
      return;
    }

    for (const subtitle of media.metadata.subtitles) {
      if (subtitle.codecName === 'webvtt') {
        this.addSubtitleTrack(new NativeSubtitleTrack(subtitle, media.metadata, videoPlayer));
      } else if (subtitle.codecName === 'ass' || subtitle.codecName === 'ssa') {
        this.addSubtitleTrack(new AssSubtitleTrack(subtitle, media.metadata, videoPlayer));
      } else {
        console.error('Unable to load subtitle with codecName:', subtitle.codecName);
      }
    }

    this.setAudioTrackNameMapping(media.metadata.audioNames ?? {});
  }

  destroyPlayer(): void {
    this.videoElement.remove();

    for (const subtitleTrack of this.getSubtitleTracks()) {
      subtitleTrack.deactivate();
    }
  }

  async play(): Promise<void> {
    return this.videoElement.play();
  }

  pause(): void {
    this.videoElement.pause();
  }

  getAudioTracks(): AudioTrack[] {
    return [{ id: 1, active: true, title: 'Default' }];
  }

  setAudioTrack(track: AudioTrack): void {
    // no-op
  }

  setAudioTrackNameMapping(mapping: { [p: string]: string }): void {
    this.audioTrackNameMapping.clear();
    for (const mappingKey in mapping) {
      if (mapping.hasOwnProperty(mappingKey)) {
        this.audioTrackNameMapping.set(mappingKey, mapping[mappingKey]);
      }
    }
  }

  getSubtitleTracks(): SubtitleTrack[] {
    // TODO: Take `this.videoElement.textTracks` into account
    return this.subtitleTracks;
  }

  addSubtitleTrack(track: SubtitleTrack): void {
    this.subtitleTracks.push(track);
  }

  clearSubtitleTracks(): void {
    for (const subtitleTrack of this.subtitleTracks) {
      subtitleTrack.deactivate();
    }
    this.subtitleTracks.length = 0;
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
    this.videoElement.addEventListener(event, listener, { passive: true });
  }
}
