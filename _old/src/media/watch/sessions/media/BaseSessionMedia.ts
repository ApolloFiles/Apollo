import * as CommunicationProtocol from '../CommunicationProtocol';
import WatchSession from '../WatchSession';
import WatchSessionClient from '../WatchSessionClient';

export default class BaseSessionMedia {
  data: CommunicationProtocol.Media;

  constructor(data: CommunicationProtocol.Media) {
    this.data = data;
  }

  async init(session: WatchSession, issuingClient: WatchSessionClient): Promise<void> {
    // no-op
  }

  async cleanup(session: WatchSession): Promise<void> {
    // no-op
  }
}
