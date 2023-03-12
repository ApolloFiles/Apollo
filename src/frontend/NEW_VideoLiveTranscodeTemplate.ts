import express from 'express';
import { SimpleTemplate } from './SimpleTemplate';

export type NEW_VideoLiveTransCodeTemplateData = {
  sessionId: string;

  videoFileName: string;
  videoFrontendUrl: string;
};

export default class NEW_VideoLiveTranscodeTemplate extends SimpleTemplate {
  constructor() {
    super('new-live-video-transcode', 'NEW_video_live_transcode.ejs.html');
  }

  render(req: express.Request, data: NEW_VideoLiveTransCodeTemplateData): string {
    return super.render(req, data);
  }
}
