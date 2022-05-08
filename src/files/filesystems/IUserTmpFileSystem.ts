import IUserFile from '../IUserFile';
import IUserFileSystem from './IUserFileSystem';

export default interface IUserTmpFileSystem extends IUserFileSystem {
  createTmpDir(prefix?: string): Promise<IUserFile>;
}
