import * as CommunicationProtocol from '../CommunicationProtocol';
import ApolloFileMedia from './ApolloFileMedia';
import BaseSessionMedia from './BaseSessionMedia';
import LiveTranscodeMedia from './LiveTranscodeMedia';

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
