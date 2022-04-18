import Path from 'path';
import { getAppResourcesDir } from '../Constants';
import { AbstractTemplate } from './AbstractTemplate';

export type FileIcon =
    'audio_file'
    | 'code'
    | 'data_object'
    | 'description'
    | 'folder'
    | 'folder_zip'
    | 'image'
    | 'insert_drive_file'
    | 'picture_as_pdf'
    | 'video_file';

export interface FilesTemplateData {
  lastFavoriteFiles: { favorite: true, icon: FileIcon, title: string, subtitle: string | null, previewImg: { src: string, alt: string } }[];
  recentFiles: { favorite: boolean, icon: FileIcon, title: string, subtitle: string | null, previewImg: { src: string, alt: string } }[];
  banners: { type: 'info' | 'success' | 'warning' | 'error', msg: string, dismissible: boolean }[];
  files: { icon: FileIcon, name: string, owner: string, lastChanged: Date, size: string | null, mimeType: string | null, frontendUrl: string }[];
}

export class FilesTemplate extends AbstractTemplate {
  constructor(frontendType: 'browse' | 'trash') {
    super(`apollo:files:${frontendType}`, Path.join(getAppResourcesDir(), 'public', 'dynamic', 'files.ejs.html'));
  }

  render(data: FilesTemplateData): string {
    return super.renderEjs({...data, global: {templateId: this.templateId}});
  }
}
