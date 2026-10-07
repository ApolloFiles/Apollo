import type { Router } from '@sprax/node-framework/web';

export default interface ApolloRouter extends Router {
  allowUnauthenticatedAccess?(): boolean;

  allowAccessTokenAccess?(): boolean;
}

export function isApolloRouter(router: Router): router is ApolloRouter {
  return isAbsentOrFunction(router, 'allowUnauthenticatedAccess') && isAbsentOrFunction(router, 'allowAccessTokenAccess');
}

function isAbsentOrFunction(router: Router, key: 'allowUnauthenticatedAccess' | 'allowAccessTokenAccess'): boolean {
  const value: unknown = Reflect.get(router, key);
  return value === undefined || typeof value === 'function';
}
