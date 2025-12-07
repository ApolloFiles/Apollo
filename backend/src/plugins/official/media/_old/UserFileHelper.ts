import type VirtualFile from '../../../../files/VirtualFile.js';

export default class UserFileHelper {
  static findFolderPoster(directory: VirtualFile): Promise<VirtualFile | null> {
    return UserFileHelper.findFirstFileMatchingInDirectory(directory, /^(?:poster|folder|cover)\.(?:png|jpg|jpeg|avif|webp)$/ig);
  }

  static findFolderBackdrop(directory: VirtualFile): Promise<VirtualFile | null> {
    return UserFileHelper.findFirstFileMatchingInDirectory(directory, /^(?:backdrop|background)\.(?:png|jpg|jpeg|avif|webp)$/ig);
  }

  static async findFirstFileMatchingInDirectory(directory: VirtualFile, fileNamePattern: RegExp): Promise<VirtualFile | null> {
    const files = await directory.getFiles(); // TODO: Replace with a walk
    for (const file of files) {
      if (fileNamePattern.test(file.getFileName())) {
        return file;
      }
    }
    return null;
  }
}
