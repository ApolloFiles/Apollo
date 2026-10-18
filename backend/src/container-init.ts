import 'reflect-metadata';
import { autoLoadRouters } from '@sprax/node-framework/web';

// manual imports for 'auto' loading:
import './cache/event/FileContentCacheEventListener.js';
import './plugins/official/ffmpeg/probe/cache/FfprobeCache.js';
import './plugins/official/media/_old/video-player/seek-thumbnails/cache/SeekThumbnailIndexCache.js';
import './plugins/official/media/_old/video-player/seek-thumbnails/cache/SeekThumbnailSpriteCache.js';
import './plugins/official/media/library/external_metadata/anidb/cache/AniDbAnimeXmlCache.js';
import './plugins/official/media/library/external_metadata/anidb/cache/AniDbImageCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbFindByExternalIdCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbImageCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbMovieCache.js';
import './plugins/official/media/library/external_metadata/tmdb/cache/TmdbTvSeriesCache.js';
import './plugins/official/media/library/images/GeneratedMediaPosterCache.js';
import './plugins/official/media/library/images/MediaFallbackImageCache.js';
import './plugins/official/media/library/images/MediaImageCache.js';
import './plugins/official/media/library/thumbnail/VideoThumbnailCache.js';

await autoLoadRouters(new URL('./webserver/routes/', import.meta.url));
