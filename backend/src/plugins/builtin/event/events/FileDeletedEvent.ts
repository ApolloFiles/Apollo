import type VirtualFile from '../../../../files/VirtualFile.js';
import AbstractBaseEvent from './AbstractBaseEvent.js';

export default class FileDeletedEvent extends AbstractBaseEvent {
  constructor(
    public readonly file: VirtualFile,
  ) {
    super();
  }
}
