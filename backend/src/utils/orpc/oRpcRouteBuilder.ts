import { os } from '@orpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { auth, convertHeadersIntoBetterAuthFormat } from '../auth.js';

export const base = os
  .errors({
    UNAUTHORIZED: {},
  });

export const authenticated = base
  .$context<{ headers: IncomingHttpHeaders }>()
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
