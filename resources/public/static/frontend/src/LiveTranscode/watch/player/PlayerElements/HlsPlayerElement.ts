import Hls, {HlsConfig} from 'hls.js';
import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import NativePlayerElement from './NativePlayerElement';

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
}
