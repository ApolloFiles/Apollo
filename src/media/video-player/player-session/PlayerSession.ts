import { container } from 'tsyringe';
import ApolloUser from '../../../user/ApolloUser';
import LocalFile from '../../../user/files/local/LocalFile';
import VirtualFile from '../../../user/files/VirtualFile';
import { StartPlaybackResponse } from '../../../webserver/Api/v0/media/player-session/change-media';
import VideoLiveTranscodeMedia from '../live-transcode/VideoLiveTranscodeMedia';
import VideoLiveTranscodeMediaFactory from '../live-transcode/VideoLiveTranscodeMediaFactory';
import TemporaryDirectory from './TemporaryDirectory';

type Token = {
  readonly token: string,
  readonly expires: Date,
}

type ClientAccessToken = Token & {
  lastUsername: string,
  readonly user: ApolloUser | null,
}

export default class PlayerSession {
  public readonly id: string;
  public readonly owner: ApolloUser;
  private currentMedia: VideoLiveTranscodeMedia | null = null;
  private readonly clientAccessTokens: ClientAccessToken[] = [];  // TODO: these are the token given to clients that are in the session (used for reconnects too)
  private joinToken: Token | null = null; // TODO: Allow others to 'join' this session using this token; joined clients get a access_token
  private playerState: { lastUpdated: Date, data: { currentTime: number } } | null = null;  // TODO
  public readonly tmpDir: TemporaryDirectory;

  constructor(id: string, owner: ApolloUser) {
    this.id = id;
    this.owner = owner;

    this.tmpDir = TemporaryDirectory.create(this.id);
  }

  getCurrentMedia(): VideoLiveTranscodeMedia | null {
    return this.currentMedia;
  }

  getCurrentFile(): VirtualFile | null {
    return this.currentMedia?.sourceFile ?? null;
  }

  // TODO: I don't think this method should be in here
  async startLiveTranscode(file: LocalFile, startOffsetInSeconds: number = 0, mediaMetadata: StartPlaybackResponse['mediaMetadata']): Promise<VideoLiveTranscodeMedia> {
    // FIXME: do not access the container like that
    const videoLiveTranscodeMediaFactory = container.resolve(VideoLiveTranscodeMediaFactory);

    const newMedia = await videoLiveTranscodeMediaFactory.create(this.tmpDir, file, startOffsetInSeconds, mediaMetadata);
    this.currentMedia?.destroy().catch(console.error);
    this.currentMedia = newMedia;

    return this.currentMedia;
  }
}
