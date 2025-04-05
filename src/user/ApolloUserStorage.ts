import Fs from 'node:fs';
import Path from 'node:path';
import { getAppConfigDir } from '../Constants';
import ApolloUser from './ApolloUser';

type UsersFile = { id: string, displayName: string, oauth: { [provider: string]: string }, apiTokens: string[] }[];

export default class ApolloUserStorage {
  private readonly USERS_FILE_PATH = Path.join(getAppConfigDir(), 'users.json');

  async findById(id: bigint): Promise<ApolloUser | null> {
    const currentUsers = await this.getCurrentUsers();
    const user = currentUsers.find(u => u.id.toString() === id.toString());
    return user != null ? new ApolloUser(BigInt(user.id), user.displayName) : null;
  }

  async findByOAuth(provider: string, id: string): Promise<ApolloUser | null> {
    const currentUsers = await this.getCurrentUsers();

    for (const user of currentUsers) {
      if (user.oauth[provider] == id) {
        return new ApolloUser(BigInt(user.id), user.displayName);
      }
    }

    return null;
  }

  async findByApiToken(token: string): Promise<ApolloUser | null> {
    const currentUsers = await this.getCurrentUsers();

    for (const user of currentUsers) {
      if (user.apiTokens.includes(token)) {
        return new ApolloUser(BigInt(user.id), user.displayName);
      }
    }

    return null;
  }

  async create(displayName: string): Promise<ApolloUser> {
    const currentUsers = await this.getCurrentUsers();

    let highestExistingUserId = 0n;
    for (const user of currentUsers) {
      if (BigInt(user.id) > highestExistingUserId) {
        highestExistingUserId = BigInt(user.id);
      }
    }

    const apolloUser = new ApolloUser(highestExistingUserId + 1n, displayName);

    currentUsers.push({
      id: apolloUser.id.toString(),
      displayName: apolloUser.displayName,
      oauth: {},
      apiTokens: [],
    });
    Fs.mkdirSync(getAppConfigDir(), { recursive: true });
    Fs.writeFileSync(this.USERS_FILE_PATH, JSON.stringify(currentUsers));

    return apolloUser;
  }

  private async getCurrentUsers(): Promise<UsersFile> {
    try {
      const userFileContent = await Fs.promises.readFile(this.USERS_FILE_PATH, 'utf8');
      return JSON.parse(userFileContent);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return [];
      }
      throw e;
    }
  }
}
