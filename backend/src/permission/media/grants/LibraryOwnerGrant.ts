import { singleton } from 'tsyringe';
import Grant from '../../Grant.js';
import type MediaAccessContext from '../MediaAccessContext.js';

@singleton()
export default class LibraryOwnerGrant extends Grant<MediaAccessContext> {
  check(ctx: MediaAccessContext): boolean {
    return ctx.resource.ownerId === ctx.subject.id;
  }
}
