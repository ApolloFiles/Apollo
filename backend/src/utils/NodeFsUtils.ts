import Fs from 'node:fs';

export default class NodeFsUtils {
  static async readdirWithTypesIfExists(path: Fs.PathLike): Promise<Fs.Dirent[]> {
    try {
      return await Fs.promises.readdir(path, { withFileTypes: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }

      throw err;
    }
  }

  static async readdirIfExists(path: Fs.PathLike): Promise<string[]> {
    try {
      return await Fs.promises.readdir(path, { withFileTypes: false });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }

      throw err;
    }
  }
}
