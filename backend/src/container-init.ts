import 'reflect-metadata';
import { autoLoadRouters } from '@sprax/node-framework/web';

// manual imports for 'auto' loading:
import './cache/event/FileContentCacheEventListener.js';
import './files/cache/user/ApolloFileSystemEventListener.js';
import './plugins/official/media/library/external_metadata/AniDb/cache/AniDbAnimeXmlCache.js';
import './plugins/official/media/library/external_metadata/AniDb/cache/AniDbImageCache.js';

await autoLoadRouters(new URL('./webserver/routes/', import.meta.url));
