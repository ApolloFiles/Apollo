import * as CommunicationProtocol from '../CommunicationProtocol';
import { PlayerMode } from '../CommunicationProtocol';

export default class SessionMedia {
  static readonly AVAILABLE_MEDIA: { [key in CommunicationProtocol.PlayerMode]: typeof SessionMedia } = {
    ['native']: SessionMedia,
    ['hls']: SessionMedia,
    ['live_transcode']: SessionMedia,
    ['youtube']: SessionMedia,
    ['twitch']: SessionMedia
  };

  readonly nameOrUri: string;
  readonly mode: PlayerMode;

  constructor(nameOrUri: string, mode: PlayerMode) {
    this.nameOrUri = nameOrUri;
    this.mode = mode;
  }

  toProtocolMedia(): CommunicationProtocol.Media {
    return {
      uri: this.nameOrUri,
      mode: this.mode
    };
  }

  static constructMedia(nameOrUri: string, mode: PlayerMode): SessionMedia {
    return new SessionMedia.AVAILABLE_MEDIA[mode](nameOrUri, mode);
  }
}
