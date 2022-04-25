import IUserFile from './files/IUserFile';

export default class FileSearch {
  static async searchFile(file: IUserFile, query: string): Promise<IUserFile[]> {
    if (!await file.isDirectory()) {
      throw new Error('File is not a directory');
    }

    return this.searchFileRecursive(await file.getFiles(), query);
  }

  private static async searchFileRecursive(files: IUserFile[], query: string): Promise<IUserFile[]> {
    const result = [];

    for (const file of files) {
      if (file.getName().toLowerCase().includes(query.toLowerCase())) {
        result.push(file);
      }

      if (await file.isDirectory()) {
        const innerFiles = await this.searchFileRecursive(await file.getFiles(), query);
        result.push(...innerFiles);
      }
    }

    return result;
  }
}
