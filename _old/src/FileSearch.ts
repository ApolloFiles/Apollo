import VirtualFile from './user/files/VirtualFile';

export default class FileSearch {
  static async searchFile(file: VirtualFile, query: string): Promise<VirtualFile[]> {
    if (!await file.isDirectory()) {
      throw new Error('File is not a directory');
    }

    return this.searchFileRecursive(await file.getFiles(), query);
  }

  private static async searchFileRecursive(files: VirtualFile[], query: string): Promise<VirtualFile[]> {
    const result = [];

    for (const file of files) {
      if (file.getFileName().toLowerCase().includes(query.toLowerCase())) {
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
