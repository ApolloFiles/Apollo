import { HttpClient } from '@spraxdev/node-commons';
import express from 'express';
import passport from 'passport';
import { Strategy as GitHubPassportStrategy } from 'passport-github2';
import { Strategy as Oauth2PassportStrategy } from 'passport-oauth2';
import Path from 'path';
import { getConfig } from '../Constants';
import UserStorage from '../UserStorage';

(BigInt.prototype as any).toJSON = function () {  // FIXME: Should not be needed
  return this.toString();
};

export const loginRouter = express.Router();

passport.serializeUser((user: any, done) => {
  done(null, user.id.toString());
});
passport.deserializeUser(async (userId: string, done) => {
  done(null, await new UserStorage().getUser(BigInt(userId)));
});

passport.use(new GitHubPassportStrategy({
      clientID: getConfig().data.oauth.github.clientId,
      clientSecret: getConfig().data.oauth.github.clientSecret,
      callbackURL: 'http://localhost:8080/login/github/callback'
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      const apolloUser = await new UserStorage().getUserByOauth('github', profile.id);

      if (apolloUser == null) {
        console.log(`GitHub Login failed for GitHub-UserId '${profile.id}' (no apollo user found)`);
      }

      done(null, apolloUser ?? false);
    }
));
passport.use('microsoft', new Oauth2PassportStrategy({
      authorizationURL: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
      tokenURL: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      clientID: getConfig().data.oauth.microsoft.clientId,
      clientSecret: getConfig().data.oauth.microsoft.clientSecret,
      callbackURL: 'http://localhost:8080/login/microsoft/callback',
      scope: ['user.read']
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      const httpRes = await new HttpClient(HttpClient.generateUserAgent('Apollo', 'Unknown-Version'))
          .get('https://graph.microsoft.com/v1.0/me', {'Authorization': `Bearer ${accessToken}`});

      if (httpRes.statusCode !== 200) {
        done(new Error(`Microsoft Graph API returned status code ${httpRes.statusCode}`));
        return;
      }

      profile = JSON.parse(httpRes.body.toString('utf-8'));

      const apolloUser = await new UserStorage().getUserByOauth('microsoft', profile.id);

      if (apolloUser == null) {
        console.log(`Microsoft Login failed for Microsoft-UserId '${profile.id}' (no apollo user found)`);
      }

      done(null, apolloUser ?? false);
    }
));

loginRouter.get('/github', passport.authenticate('github'));
loginRouter.get('/github/callback', passport.authenticate('github', {
  successRedirect: '/',
  failWithError: true
}), failedLoginHandler);

loginRouter.get('/microsoft', passport.authenticate('microsoft'));
loginRouter.use('/microsoft/callback', passport.authenticate('microsoft', {
  successRedirect: '/',
  failWithError: true
}), failedLoginHandler);

loginRouter.get('/', (req, res, next) => {
  res
      .type('text/html')
      .send(`<h1>Sign in</h1>
                  <a href="${Path.join(decodeURI(req.originalUrl), 'github')}">Sign in with GitHub <strong>(recommended)</strong></a><br>
                  <a href="${Path.join(decodeURI(req.originalUrl), 'microsoft')}">Sign in with Microsoft <strong>(recommended)</strong></a><br>`);
});

function failedLoginHandler(err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) {
  const errorMessage = req.query['error_description'] ??
      (err.message == 'Unauthorized' ?
          'User does not exist in database' :
          err.message.replaceAll('\n', '<br>'));

  res
      .status(401)
      .type('text/html')
      .send(`<h1>401 Unauthorized</h1>\n${errorMessage}`);
}
