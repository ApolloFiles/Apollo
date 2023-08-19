import express from 'express';
import {LibraryMedia, LibraryTitle} from '../database/postgres/MediaLibraryTable';
import Library from '../media/libraries/Library';
import {SimpleTemplate} from './SimpleTemplate';

export type MediaLibraryTitleData = {
  library: Library;
  title: LibraryTitle;
  media: Map<string, LibraryMedia[]>;
};

export default class MediaLibraryTitleTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/title.ejs.html');
  }

  render(req: express.Request, data: MediaLibraryTitleData): string {
    return super.render(req, data);
  }
}
