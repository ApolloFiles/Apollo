import Fs from 'node:fs';

export default class FsUtils {
  /**
   * This utility tries to offer an atomic move of a file, even across file systems.
   *
   * If you try to move a file across file systems, it will instead be copied first.
   * If `${newPath}.path` does not exist yet, it will first be copied there, before replacing the target file, to offer an atomic replacement of the target file.
   */
  static async moveOrAtomicCopyFile(oldPath: Fs.PathLike, newPath: Fs.PathLike): Promise<void> {
    try {
      await Fs.promises.rename(oldPath, newPath);
    } catch (err) {
      if (err instanceof Error && (err as any).code === 'EXDEV') {
        const newPathWithPartSuffix = newPath + '.part';
        if (Fs.existsSync(newPathWithPartSuffix)) {
          await Fs.promises.copyFile(oldPath, newPath);
        } else {
          // First copy to a '.part' file, without overwriting an existing file, so we can replace the target file atomically
          try {
            await Fs.promises.copyFile(oldPath, newPathWithPartSuffix);
            await Fs.promises.rename(newPathWithPartSuffix, newPath);
          } finally {
            await Fs.promises.rm(newPathWithPartSuffix, { force: true });
          }
        }

        await Fs.promises.rm(oldPath, { force: true });
      }
    }
  }
}
