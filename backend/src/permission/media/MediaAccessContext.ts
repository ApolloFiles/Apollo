import type ReadContentsLibrary from '../../plugins/official/media/library/database/library/ReadContentsLibrary.js';
import type ApolloUser from '../../user/ApolloUser.js';
import Context from '../Context.js';

export type MediaContextAction = 'read-contents' | 'write';

export default class MediaAccessContext extends Context<ApolloUser, ReadContentsLibrary, MediaContextAction> {
}
