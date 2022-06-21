import express from 'express';
import Path from 'path';
import * as querystring from 'querystring';
import AbstractUser from '../AbstractUser';
import { getConfig, getHttpClient } from '../Constants';
import { ApolloConfig } from '../global';
import UserStorage from '../UserStorage';
import Utils from '../Utils';

export const loginRouter = express.Router();

loginRouter.all('/', (req: express.Request, res, next) => {
  Utils.restful(req, res, next, {
    get: () => {
      if (req.user) {
        res.redirect('/');
        // TODO: Wenn bereits eingeloggt, umleiten (query param beachten, wenn kein param sagen dass man bereits eingeloggt ist statt umleiten)
        return;
      }

      let html = '<h1><u>You are not logged in.</u></h1><br><br>';

      for (const thirdPartyKey in getConfig().data.login.thirdParty) {
        const thirdParty = getConfig().data.login.thirdParty[thirdPartyKey];

        if (!thirdParty.enabled) {
          continue;
        }

        html += `<a href="${Path.join(req.originalUrl, 'third-party', thirdPartyKey)}">${thirdParty.displayName ?? thirdPartyKey}</a><br>`;
      }

      res.status(401)
          .send(html);
    }
  });
});

loginRouter.all('/third-party/:thirdPartyProviderKey?', (req, res, next) => {
  Utils.restful(req, res, next, {
    get: async (): Promise<void> => {
      // TODO: Wenn bereits eingeloggt aber ohne code query param etc., dann umleiten ansonsten Fehlermeldung zeigen

      const thirdPartyProviderKey = req.params.thirdPartyProviderKey;
      const thirdPartyProvider = getConfig().data.login.thirdParty[thirdPartyProviderKey as string];

      if (thirdPartyProviderKey == null || thirdPartyProvider == null) {
        res.status(404)
            .send('Unable to find the requested third party provider.');
        return;
      }
      if (!thirdPartyProvider.enabled) {
        res.status(409)
            .send('The requested third party provider is not enabled.');
        return;
      }

      switch (thirdPartyProvider.type) {
        case 'OAuth2':
          await handleOAuth2Request(req, res, next, thirdPartyProviderKey, thirdPartyProvider);
          return;
        default:
          res.status(500)
              .send(`Found the requested third party provider, but its type is not supported (broken configuration?).`);
          return;
      }
    }
  });
});

function getOriginalPath(req: express.Request): string {
  if (!req.originalUrl.startsWith('/')) {
    throw new Error('originalUrl must start with /');
  }

  let originalPath = req.originalUrl;
  const questionMarkIndex = originalPath.indexOf('?');

  if (questionMarkIndex > 0) {
    originalPath = originalPath.substring(0, questionMarkIndex);
  }

  return originalPath;
}

async function handleOAuth2Request(req: express.Request, res: express.Response, next: express.NextFunction, thirdPartyProviderKey: string, thirdPartyProvider: ApolloConfig['login']['thirdParty'][string]): Promise<void> {
  if (req.query.error || req.query.error_description) {
    const errorType = typeof req.query.error == 'string' ? req.query.error : 'unknown';
    const errorDescription = typeof req.query.error_description == 'string' ? req.query.error_description : '–';

    res.status(400)
        .send(`<b>Error-Type:</b> ${Utils.escapeHtml(errorType)}\n<br><b>Error-Description:</b> ${Utils.escapeHtml(errorDescription).replace(/\r?\n/g, '<br>\n')}`);
    return;
  }

  if (typeof req.query.code != 'string' || req.query.code.length <= 0) {
    res.redirect(thirdPartyProvider.authorizeUrl + '?' + querystring.stringify({
      client_id: thirdPartyProvider.clientId,
      redirect_uri: new URL(getOriginalPath(req), getConfig().data.baseUrl).href,
      response_type: 'code',
      response_mode: 'query',
      scope: thirdPartyProvider.scopes.join(' ')
    }));

    return;
  }

  let tokenRequestBodyData = {
    client_id: thirdPartyProvider.clientId,
    client_secret: thirdPartyProvider.clientSecret,
    grant_type: 'authorization_code',

    code: req.query.code,
    redirect_uri: new URL(getOriginalPath(req), getConfig().data.baseUrl).href
  };
  let tokenRequestBody;

  switch (thirdPartyProvider.requestBodyContentType) {
    case 'x-www-form-urlencoded':
      tokenRequestBody = querystring.stringify(tokenRequestBodyData);
      break;
    case 'json':
      tokenRequestBody = JSON.stringify(tokenRequestBodyData);
      break;

    default:
      res.status(500)
          .send(`The configured request body content type is not supported (broken configuration?).`);
      return;
  }

  const tokenResponse = await getHttpClient().post(thirdPartyProvider.tokenUrl,
      {
        Accept: 'application/json',
        'Content-Type': `application/${thirdPartyProvider.requestBodyContentType}`
      }, tokenRequestBody);

  const tokenResponseBody = JSON.parse(tokenResponse.body.toString('utf-8'));

  if (tokenResponseBody.error) {
    res.status(400)
        .send(`<b>Error-Type:</b> ${Utils.escapeHtml(tokenResponseBody.error)}\n<br><b>Error-Description:</b> ${Utils.escapeHtml(tokenResponseBody.error_description || '–').replace(/\r?\n/g, '<br>\n')}`);
    return;
  }

  const accountInfoRes = await getHttpClient().get(thirdPartyProvider.accountInfo.url, {
    Accept: 'application/json',
    Authorization: `Bearer ${tokenResponseBody.access_token}`
  });

  if (!accountInfoRes.ok) {
    res.status(500)
        .send('Unable to fetch account info from the third party provider.');
    return;
  }

  if (accountInfoRes.type != 'application/json') {
    res.status(500)
        .send('The third party provider returned a non-JSON response for the account info request.');
    return;
  }

  const accountInfoBody = JSON.parse(accountInfoRes.body.toString('utf-8'));
  const accountId = getValueForKeyPath(accountInfoBody, thirdPartyProvider.accountInfo.idField)?.toString();
  const accountName = getValueForKeyPath(accountInfoBody, thirdPartyProvider.accountInfo.nameField);

  if (typeof accountId != 'string' || accountId.trim().length <= 0) {
    res.status(500)
        .send('The third party provider returned a non-string or empty ID for the account info request.');
    return;
  }

  const apolloUser = await new UserStorage().getUserByOauth(thirdPartyProviderKey, accountId);

  if (apolloUser == null) {
    res.status(401)
        .send('There is no user account linked to this third party provider.<br>' +
            `<pre>thirdPartyProviderKey='${thirdPartyProviderKey}'\naccountName='${accountName}'\naccountId='${accountId}'</pre>`);
    return;
  }

  // TODO: Update stored OAuth account data if necessary
  // TODO: Add profile image functionality

  updateSessionData(req, apolloUser);

  console.log(`User '${apolloUser.getDisplayName()}' (id=${apolloUser.getId()}) successfully logged in from '${req.ip}' via ${thirdPartyProviderKey} (User-Agent='${req.header('User-Agent') ?? ''}')`);

  res.redirect('/');
}

function getValueForKeyPath(obj: object, keys: string[]): any {
  let currObj: any = obj;

  for (const key of keys) {
    if (currObj == null) {
      return undefined;
    }

    currObj = currObj[key];
  }

  return currObj;
}

function updateSessionData(req: express.Request, user: AbstractUser): void {
  req.session.userId = user.getId();
}
