import express from 'express';
import { Stream } from '../media/video/analyser/VideoAnalyser.Types';
import { SimpleTemplate } from './SimpleTemplate';

export type VideoLiveTransCodeTemplateData = {
  videoFileName: string;
  videoFrontendUrl: string;

  aliasToken: string;

  manifestFileName: string;
  manifestMimeType: string;

  chapters: { label: string, start: number }[];

  debug?: {
    streams: Stream[];
  };
};

export default class VideoLiveTranscodeTemplate extends SimpleTemplate {
  constructor() {
    super('live-video-transcode', 'video_live_transcode.ejs.html');
  }

  render(req: express.Request, data: VideoLiveTransCodeTemplateData): string {
    return super.render(req, data);
  }
}
