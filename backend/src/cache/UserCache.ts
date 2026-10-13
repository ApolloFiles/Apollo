import type ApolloUser from '../user/ApolloUser.js';
import { BoundUserCache } from './BoundUserCache.js';
import type { CacheDefinition } from './CacheDefinition.js';
import { CacheEngine } from './internal/CacheEngine.js';
import type { CacheServices } from './internal/CacheServices.js';

export abstract class UserCache<T extends {} | null> {
  /** Lives here, not in {@link BoundUserCache}, so concurrent requests of one user share one single-flight */
  private readonly engine: CacheEngine<T>;

  protected constructor(
    private readonly services: CacheServices,
    public readonly definition: CacheDefinition<T>,
  ) {
    this.engine = new CacheEngine(services, definition);
    services.cacheNamespaceRegistry.register(this);
  }

  forUser(user: ApolloUser): BoundUserCache<T> {
    return new BoundUserCache(this.engine, this.definition, this.services, user.id);
  }
}
