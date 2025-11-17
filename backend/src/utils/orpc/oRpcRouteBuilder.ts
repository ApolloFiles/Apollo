import { os } from '@orpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { auth, convertHeadersIntoBetterAuthFormat } from '../auth.js';

export type ORPCInitialContext = {
  headers: IncomingHttpHeaders
}

export const base = os
  .errors({
    UNAUTHORIZED: {},
    REQUESTED_ENTITY_NOT_FOUND: {},
  });


export const authenticated = base
  .$context<ORPCInitialContext>()
  .use(async ({ context, next }) => {
    const headers = convertHeadersIntoBetterAuthFormat(context.headers);
    const sessionInfo = await auth.api.getSession({ headers });

    return next({
      context: {
        authHeaders: headers,
        sessionInfo,
      },
    });
  });
