import express from 'express';
import {SimpleTemplate} from './SimpleTemplate';

export type MediaLibraryEditMediaData = {
  videoAnalysis: {
    fileName: string;
    formatNameLong: string;
    probeScore: number;
    duration: string;

    tags: { [key: string]: string };
    chapters: {
      start: number;
      end: number;
      tags: { [key: string]: string };
    }[];

    streams: {
      index: number;
      codecType: string;
      codecNameLong: string;
      tags: { [key: string]: string };
    }[];
  };
};

export default class MediaLibraryEditMediaTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/editMedia.ejs.html');
  }

  render(req: express.Request, data: MediaLibraryEditMediaData): string {
    return super.render(req, data);
  }
}
