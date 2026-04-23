import type ApolloFileURI from '../../uri/ApolloFileURI.js';
import type ApolloUser from '../../user/ApolloUser.js';
import Context from '../Context.js';

export type FileContextAction = 'read' | 'write';

export default class FileAccessContext extends Context<ApolloUser, ApolloFileURI, FileContextAction> {
}
