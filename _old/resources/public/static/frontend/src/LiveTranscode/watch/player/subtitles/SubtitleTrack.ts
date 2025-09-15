import * as CommunicationProtocol from '../../../../../../../../../src/media/watch/sessions/CommunicationProtocol';
import ApolloVideoPlayer from '../ApolloVideoPlayer';

export default abstract class SubtitleTrack {
  protected readonly subtitle: CommunicationProtocol.SubtitleMetadata;
  protected readonly mediaMetadata: CommunicationProtocol.Media['metadata'];
  protected readonly videoPlayer: ApolloVideoPlayer;

  constructor(subtitle: CommunicationProtocol.SubtitleMetadata, mediaMetadata: CommunicationProtocol.Media['metadata'], videoPlayer: ApolloVideoPlayer) {
    this.subtitle = subtitle;
    this.mediaMetadata = mediaMetadata;
    this.videoPlayer = videoPlayer;
  }

  get title(): string {
    return this.subtitle.title;
  }

  abstract activate(): void;

  abstract deactivate(): void;
}
