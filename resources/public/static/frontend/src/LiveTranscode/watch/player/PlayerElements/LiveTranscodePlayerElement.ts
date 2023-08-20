import Hls, {HlsConfig} from 'hls.js';
import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import HlsPlayerElement from './HlsPlayerElement';

export default class LiveTranscodePlayerElement extends HlsPlayerElement {
  private liveTranscodeDuration?: number;

  constructor(container: HTMLElement, hlsOptions: Partial<HlsConfig> = {}) {
    super(container, {...hlsOptions, autoStartLoad: false});
  }

  set duration(duration: number) {
    this.liveTranscodeDuration = duration;
  }

  get duration(): number {
    return this.liveTranscodeDuration ?? this.videoElement.duration;
  }

  async loadMedia(media: CommunicationProtocol.Media): Promise<void> {
    await super.loadMedia(media);
    this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
      this.hls?.startLoad(0);
    });
  }
}
