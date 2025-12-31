import * as OpenIdClient from 'openid-client';
import { singleton } from 'tsyringe';
import { z } from 'zod';
import AppConfiguration from '../../config/AppConfiguration.js';
import SimpleHttpClient from '../../http/SimpleHttpClient.js';

const ALL_OAUTH_TYPES = ['github', 'discord', 'google', 'microsoft'] as const;
export type OAuthType = (typeof ALL_OAUTH_TYPES)[number];

export type OAuthConfig = {
  type: OAuthType,
  openIdConfig: OpenIdClient.Configuration,
  scopes: string[],
  fetchUserInfo: (openIdConfig: OpenIdClient.Configuration, accessToken: string, expectedSubjectId: string | undefined) => Promise<OAuthUserInfo>,
}

export type OAuthUserInfo = {
  id: string,
  displayName: string,
  profilePictureBytes: Buffer | null,
}

@singleton()
export default class OAuthConfigurationProvider {
  constructor(
    private readonly appConfig: AppConfiguration,
    private readonly httpClient: SimpleHttpClient,
  ) {
  }

  isTypeAvailable(type: string): type is OAuthType {
    const availableTypes: string[] = this.getAvailableTypes();
    return availableTypes.includes(type);
  }

  getAvailableTypes(): OAuthType[] {
    const oAuthConfig = this.appConfig.config.login.oAuth;

    const availableTypes: OAuthType[] = [];
    for (const type of ALL_OAUTH_TYPES) {
      if (type in oAuthConfig) {
        availableTypes.push(type);
      }
    }
    return availableTypes;
  }

  async createConfig(type: OAuthType): Promise<OAuthConfig> {
    const oAuthConfig = this.appConfig.config.login.oAuth;

    let scopes: OAuthConfig['scopes'];
    let serverMetadata: OpenIdClient.ServerMetadata;
    let fetchUserInfo: OAuthConfig['fetchUserInfo'];

    switch (type) {
      case 'github':
        scopes = [];
        serverMetadata = {
          authorization_endpoint: 'https://github.com/login/oauth/authorize',
          token_endpoint: 'https://github.com/login/oauth/access_token',
          code_challenge_methods_supported: ['S256'],

          issuer: 'https://github.com/',
        };

        fetchUserInfo = async (_openIdConfig, accessToken): Promise<OAuthUserInfo> => {
          const userInfoResponse = await this.httpClient.get('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });

          if (userInfoResponse.statusCode !== 200) {
            throw new Error(`Failed to fetch GitHub user info: ${userInfoResponse.statusCode} ${userInfoResponse.body}`);
          }

          const relevantInfo = z.object({
            id: z.number().positive(),
            login: z.string().nonempty(),
            avatar_url: z.url(),
          }).parse(userInfoResponse.parseBodyAsJson());

          let profilePictureBytes: Buffer | null = null;

          const profilePictureResponse = await this.httpClient.get(relevantInfo.avatar_url, { headers: { Accept: 'image/*' } });
          if (profilePictureResponse.statusCode === 200) {
            profilePictureBytes = profilePictureResponse.body;
          } else if (profilePictureResponse.statusCode != 404) {
            console.error(`Failed to fetch GitHub profile picture: ${profilePictureResponse.statusCode} ${profilePictureResponse.body}`);
          }

          return {
            id: relevantInfo.id.toString(),
            displayName: `@${relevantInfo.login}`,
            profilePictureBytes,
          };
        };
        break;

      case 'discord':
        scopes = ['identify'];
        serverMetadata = {
          authorization_endpoint: 'https://discord.com/oauth2/authorize',
          token_endpoint: 'https://discord.com/api/oauth2/token',
          revocation_endpoint: 'https://discord.com/api/oauth2/token/revoke',
          code_challenge_methods_supported: ['S256'], // TODO: Discord docs don't mention this, probably not supported

          issuer: 'https://discord.com/',
        };

        fetchUserInfo = async (_openIdConfig, accessToken): Promise<OAuthUserInfo> => {
          const userInfoResponse = await this.httpClient.get('https://discord.com/api/oauth2/@me', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          });

          if (userInfoResponse.statusCode !== 200) {
            throw new Error(`Failed to fetch Discord user info: ${userInfoResponse.statusCode} ${userInfoResponse.body}`);
          }

          const relevantInfo = z.object({
            user: z.object({
              id: z.string().nonempty(),
              username: z.string().nonempty(),
              avatar: z.string().nonempty().optional(),
            }),
          }).parse(userInfoResponse.parseBodyAsJson());

          let profilePictureBytes: Buffer | null = null;

          if (relevantInfo.user.avatar != null) {
            const profilePictureResponse = await this.httpClient.get(
              `https://cdn.discordapp.com/avatars/${relevantInfo.user.id}/${relevantInfo.user.avatar}.png?size=1024`,
              { headers: { Accept: 'image/png' } },
            );

            if (profilePictureResponse.statusCode === 200) {
              profilePictureBytes = profilePictureResponse.body;
            } else {
              console.error(`Failed to fetch Discord profile picture: ${profilePictureResponse.statusCode} ${profilePictureResponse.body}`);
            }
          }

          return {
            id: relevantInfo.user.id,
            displayName: relevantInfo.user.username,
            profilePictureBytes,
          };
        };
        break;

      case 'google':
        scopes = ['https://www.googleapis.com/auth/userinfo.profile'];
        fetchUserInfo = async (openIdConfig, accessToken, expectedSubjectId): Promise<OAuthUserInfo> => {
          if (expectedSubjectId == null) {
            throw new Error('OpenID subject ID is required for Google OAuth');
          }

          const userInfoResponse = await OpenIdClient.fetchUserInfo(openIdConfig, accessToken, expectedSubjectId);

          const userInfo = z.object({
            sub: z.string().nonempty(),
            name: z.string().nonempty(),
            picture: z.url(),
          }).parse(userInfoResponse);

          let profilePictureBytes: Buffer | null = null;

          const profilePictureResponse = await this.httpClient.get(userInfo.picture, { headers: { Accept: 'image/*' } });
          if (profilePictureResponse.statusCode === 200) {
            profilePictureBytes = profilePictureResponse.body;
          } else {
            console.error(`Failed to fetch Google profile picture: ${profilePictureResponse.statusCode} ${profilePictureResponse.body}`);
          }

          return {
            id: userInfo.sub,
            displayName: userInfo.name,
            profilePictureBytes,
          };
        };

        return {
          type: type,
          // TODO: Cache discovery
          openIdConfig: await OpenIdClient.discovery(new URL('https://accounts.google.com/'), oAuthConfig[type].clientId, oAuthConfig[type].clientSecret),
          scopes,
          fetchUserInfo,
        };

      case 'microsoft':
        scopes = ['openid', 'profile', 'User.Read'];
        fetchUserInfo = async (openIdConfig, accessToken, expectedSubjectId): Promise<OAuthUserInfo> => {
          if (expectedSubjectId == null) {
            throw new Error('OpenID subject ID is required for Microsoft OAuth');
          }

          const userInfoResponse = await OpenIdClient.fetchUserInfo(openIdConfig, accessToken, expectedSubjectId);

          const userInfo = z.object({
            sub: z.string().nonempty(),
            givenname: z.string().nonempty(),
            familyname: z.string().nonempty(),
            picture: z.url(),
          }).parse(userInfoResponse);

          let profilePictureBytes: Buffer | null = null;

          const profilePictureResponse = await OpenIdClient.fetchProtectedResource(openIdConfig, accessToken, new URL(userInfo.picture), 'GET');
          if (profilePictureResponse.status === 200) {
            profilePictureBytes = Buffer.from(await profilePictureResponse.bytes());
          } else {
            console.error(`Failed to fetch Microsoft profile picture: ${profilePictureResponse.status} ${await profilePictureResponse.text()}`);
          }

          return {
            id: userInfo.sub,
            displayName: `${userInfo.givenname} ${userInfo.familyname}`,
            profilePictureBytes,
          };
        };

        return {
          type: type,
          // TODO: Cache discovery
          openIdConfig: await OpenIdClient.discovery(new URL('https://login.microsoftonline.com/consumers/v2.0'), oAuthConfig[type].clientId, oAuthConfig[type].clientSecret),
          scopes,
          fetchUserInfo,
        };
    }

    return {
      type: type,
      openIdConfig: new OpenIdClient.Configuration(serverMetadata, oAuthConfig[type].clientId, oAuthConfig[type].clientSecret),
      scopes,
      fetchUserInfo,
    };
  }
}
