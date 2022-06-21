import AbstractUser from './AbstractUser';

export default interface IUserStorage {
  getUser(id: number): Promise<AbstractUser | null>;
  getUserByOauth(provider: string, id: string): Promise<AbstractUser | null>;

  createUser(displayName: string): Promise<AbstractUser>;
}
