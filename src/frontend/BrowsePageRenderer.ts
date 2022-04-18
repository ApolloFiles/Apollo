import Fs from 'fs';
import Path from 'path';

export default class BrowsePageRenderer {
  static getHtml(): string {
    return Fs.readFileSync(Path.join(__dirname, '..', '..', 'node_modules', 'apollo-frontend', 'dist', 'files.ejs.html'), 'utf-8');
  }
}

console.log(BrowsePageRenderer.getHtml());
