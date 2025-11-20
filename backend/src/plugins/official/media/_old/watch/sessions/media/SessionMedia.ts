import type * as CommunicationProtocol from '../CommunicationProtocol.js';
import ApolloFileMedia from './ApolloFileMedia.js';
import BaseSessionMedia from './BaseSessionMedia.js';
import LiveTranscodeMedia from './LiveTranscodeMedia.js';

export default class SessionMedia {
  static readonly AVAILABLE_MEDIA: { [key in CommunicationProtocol.PlayerMode]: typeof BaseSessionMedia } = {
    ['native']: BaseSessionMedia,
    ['hls']: BaseSessionMedia,
    ['apollo_file']: ApolloFileMedia,
    ['live_transcode']: LiveTranscodeMedia,
    ['youtube']: BaseSessionMedia,
    ['twitch']: BaseSessionMedia,
  };

  static constructSessionMedia(media: CommunicationProtocol.Media): BaseSessionMedia {
    return new SessionMedia.AVAILABLE_MEDIA[media.mode](media);
  }
}
