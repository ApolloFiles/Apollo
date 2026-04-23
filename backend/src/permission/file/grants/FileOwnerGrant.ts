import { singleton } from 'tsyringe';
import Grant from '../../Grant.js';
import type FileAccessContext from '../FileAccessContext.js';

@singleton()
export default class FileOwnerGrant extends Grant<FileAccessContext> {
  check(ctx: FileAccessContext): boolean {
    return ctx.subject.id === ctx.resource.userId;
  }
}
