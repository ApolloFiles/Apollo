export default class Utils {
  static prettifyFileSize(bytes: number, si: boolean = false): string {
    if (bytes < 0 || !Number.isFinite(bytes)) {
      throw new Error('The given bytes need to be a positive number');
    }

    const base = si ? 1000 : 1024;
    const units = si ?
      ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] :
      ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let i = Math.floor(Math.log(bytes) / Math.log(base));
    if (i < 0) {
      i = 0;
    } else if (i >= units.length) {
      i = units.length - 1;
    }

    return (bytes / Math.pow(base, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
  }

  static tryReplacingBadCharactersForFileName(fileName: string): string {
    return fileName.replace(/[\\/:*?"<>|]/g, '_');
  }
}
