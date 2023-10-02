import Hls, {HlsConfig} from 'hls.js';
import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import NativePlayerElement from './NativePlayerElement';
import {AudioTrack} from './PlayerElement';

export default class HlsPlayerElement extends NativePlayerElement {
  protected readonly hls: Hls;

  constructor(container: HTMLElement, hlsOptions?: Partial<HlsConfig>) {
    super(container);

    this.hls = new Hls(hlsOptions);
    this.hls.attachMedia(this.videoElement);
  }

  async loadMedia(media: CommunicationProtocol.Media): Promise<void> {
    this.hls.loadSource(media.uri);
  }

  destroyPlayer(): void {
    this.hls.destroy();
    super.destroyPlayer();
  }

  getAudioTracks(): AudioTrack[] {
    return this.hls.audioTracks
      .map((track) => ({
        id: track.id,
        active: track.id === this.hls.audioTrack,
        title: (this.audioTrackNameMapping.get(track.name) ?? track.name) || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
        lang: track.lang
      }));
  }

  setAudioTrack(track: AudioTrack): void {
    const isPlaying = !this.paused;
    if (isPlaying) {
      this.pause();
    }

    this.hls.audioTrack = track.id;

    if (isPlaying) {
      this.play().catch(console.error);
    }
  }
}
