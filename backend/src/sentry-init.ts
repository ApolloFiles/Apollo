import * as Sentry from '@sentry/node';
import Os from 'node:os';
import { getAppInfo, IS_PRODUCTION } from './constants.js';

(() => {
  const dsn = process.env.SENTRY_DSN ?? '';
  delete process.env.SENTRY_DSN;

  if (dsn === '') {
    console.warn('Sentry DSN is not configured – skipping Sentry initialization');
    return;
  }

  const appInfo = getAppInfo();
  Sentry.init({
    dsn,
    environment: IS_PRODUCTION ? 'production' : 'development',
    release: `${appInfo.name}@${appInfo.version}`,

    maxBreadcrumbs: 50,
    initialScope: {
      contexts: {
        Machine: {
          hostname: Os.hostname(),
        },
      },
    },

    beforeSend(event) {
      if (event.contexts && typeof event.contexts['Machine'] == 'object') {
        event.contexts['Machine'].memory_free = (Os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
      }
      return event;
    },
  });
})();
