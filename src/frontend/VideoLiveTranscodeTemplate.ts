import express from 'express';
import { SimpleTemplate } from './SimpleTemplate';

export default class VideoLiveTranscodeTemplate extends SimpleTemplate {
  constructor() {
    super('live-video-transcode', 'video_live_transcode.ejs.html');
  }

  render(req: express.Request, data: { videoFrontendUrl: string, aliasToken: string }): string {
    return super.render(req, data);
  }
}
