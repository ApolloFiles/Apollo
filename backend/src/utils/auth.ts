// This file is for the 'better-auth' package; Unfortunately, it does not allow us to decide the file path

import 'reflect-metadata';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { IncomingHttpHeaders } from 'node:http';
import { container } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../constants.js';
import DatabaseClient from '../database/DatabaseClient.js';

const databaseClient = container.resolve(DatabaseClient);
const appConfiguration = container.resolve(AppConfiguration);

export const auth = betterAuth({
  appName: 'Apollo',
  baseURL: appConfiguration.config.baseUrl,
  basePath: '/api/_auth',

  database: prismaAdapter(databaseClient, {
    provider: 'postgresql',
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 14, // 14 days
  },
  advanced: {
    cookiePrefix: 'apollo',
  },

  trustedOrigins: IS_PRODUCTION ? [appConfiguration.config.baseUrl] : ['http://localhost:5177', 'http://127.0.0.1:5177'],

  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
  socialProviders: Object.entries(appConfiguration.config.login.oAuth)
    .reduce((acc, [providerId, config]) => {
      acc[providerId] = {
        enabled: true,
        ...config,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      };
      return acc;
    }, {} as {
      [providerId: string]: {
        enabled: boolean;
        clientId: string;
        clientSecret: string;

        scope?: string[];
        disableDefaultScope?: boolean;
        disableSignUp?: boolean;
        disableImplicitSignUp?: boolean;
      }
    }),
});

export function convertHeadersIntoBetterAuthFormat(incomingHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const key in incomingHeaders) {
    const value = incomingHeaders[key];
    if (value) {
      headers.append(key, value.toString());
    }
  }
  return headers;
}
