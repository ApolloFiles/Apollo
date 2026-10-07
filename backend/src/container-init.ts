import 'reflect-metadata';
import { autoLoadRouters } from '@sprax/node-framework/web';

// manual imports for 'auto' loading:
import './files/cache/user/ApolloFileSystemEventListener.js';

await autoLoadRouters(new URL('./webserver/routes/', import.meta.url));
