import type * as CommunicationProtocol from '../CommunicationProtocol.js';
import type WatchSession from '../WatchSession.js';
import type WatchSessionClient from '../WatchSessionClient.js';

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
