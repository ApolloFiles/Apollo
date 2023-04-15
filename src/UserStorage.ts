import Fs from 'node:fs';
import Path from 'node:path';
import AbstractUser from './AbstractUser';
import { getAppConfigDir } from './Constants';
import IUserStorage from './IUserStorage';

type UsersFile = { id: number, displayName: string, oauth: { [provider: string]: string } }[];

export default class UserStorage implements IUserStorage {
  async getUser(id: number): Promise<AbstractUser | null> {
    const currentUsers = UserStorage.getCurrentUsers();
    const user = currentUsers.find(u => u.id.toString() === id.toString());

    if (user) {
      return new AbstractUser(user.id, user.displayName);
    }

    return null;
  }

  async getUserByOauth(provider: string, id: string): Promise<AbstractUser | null> {
    const currentUsers = UserStorage.getCurrentUsers();

    for (const user of currentUsers) {
      if (user.oauth[provider] == id) {
        return new AbstractUser(user.id, user.displayName);
      }
    }

    return null;
  }

  async createUser(displayName: string): Promise<AbstractUser> {
    const currentUsers = UserStorage.getCurrentUsers();

    const userId = currentUsers.length + 1;
    currentUsers.push({
      id: userId,
      displayName,
      oauth: {}
    });
    Fs.mkdirSync(getAppConfigDir(), {recursive: true});
    Fs.writeFileSync(Path.join(getAppConfigDir(), 'users.json'), JSON.stringify(currentUsers));

    return new AbstractUser(userId, displayName);
  }

  private static getCurrentUsers(): UsersFile {
    const filePath = Path.join(getAppConfigDir(), 'users.json');

    return Fs.existsSync(filePath) ? JSON.parse(Fs.readFileSync(filePath, 'utf8')) : [];
  }
}
