import Fs from 'node:fs';

export class NodeFsUtils {
  static async readdirWithTypesIfExists(path: Fs.PathLike): Promise<Fs.Dirent[]> {
    return (await NodeFsUtils.nullIfMissing(Fs.promises.readdir(path, { withFileTypes: true }))) ?? [];
  }

  static async nullIfMissing<T>(operation: Promise<T>): Promise<T | null> {
    try {
      return await operation;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }

      throw err;
    }
  }

  static async readdirIfExists(path: Fs.PathLike): Promise<string[]> {
    return (await NodeFsUtils.nullIfMissing(Fs.promises.readdir(path, { withFileTypes: false }))) ?? [];
  }
}
