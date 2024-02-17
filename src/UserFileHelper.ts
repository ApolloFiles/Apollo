import IUserFile from './files/IUserFile';

export default class UserFileHelper {
  static findFolderPoster(directory: IUserFile): Promise<IUserFile | null> {
    return UserFileHelper.findFirstFileMatchingInDirectory(directory, /^(?:poster|folder|cover)\.(?:png|jpg|jpeg|webp)$/ig);
  }

  static async findFirstFileMatchingInDirectory(directory: IUserFile, fileNamePattern: RegExp): Promise<IUserFile | null> {
    const files = await directory.getFiles(); // TODO: Replace with a walk
    for (const file of files) {
      if (fileNamePattern.test(file.getName())) {
        return file;
      }
    }
    return null;
  }
}
