import 'reflect-metadata';
import { autoLoadRouters } from '@sprax/node-framework/web';

// manual imports for 'auto' loading:
import './cache/event/FileContentCacheEventListener.js';
import './files/cache/user/ApolloFileSystemEventListener.js';
import './plugins/official/ffmpeg/probe/cache/FfprobeCache.js';
import './plugins/official/media/library/external_metadata/anidb/cache/AniDbAnimeXmlCache.js';
import './plugins/official/media/library/external_metadata/anidb/cache/AniDbImageCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbFindByExternalIdCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbImageCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbMovieCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbTvSeriesCache.js';
import './plugins/official/media/library/thumbnail/VideoThumbnailCache.js';

await autoLoadRouters(new URL('./webserver/routes/', import.meta.url));
