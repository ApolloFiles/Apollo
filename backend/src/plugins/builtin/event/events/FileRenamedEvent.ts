import type VirtualFile from '../../../../files/VirtualFile.js';
import AbstractBaseEvent from './AbstractBaseEvent.js';

export default class FileRenamedEvent extends AbstractBaseEvent {
  constructor(
    public readonly oldFile: VirtualFile,
    public readonly newFile: VirtualFile,
  ) {
    super();
  }
}
