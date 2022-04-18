import IUserFile from './files/IUserFile';

export default class FileSearch {
  async searchFile(file: IUserFile, query: string): Promise<IUserFile[]> {
    if (!await file.isDirectory()) {
      throw new Error('File is not a directory');
    }

    return this.searchFileRecursive(await file.getFiles(), query);
  }

  private async searchFileRecursive(files: IUserFile[], query: string): Promise<IUserFile[]> {
    const result = [];

    for (const file of files) {
      if (await file.isFile()) {
        if (file.getName().toLowerCase().includes(query.toLowerCase())) {
          result.push(file);
        }

        continue;
      }

      result.push(...await this.searchFileRecursive(await file.getFiles(), query));
    }

    return result;
  }
}
