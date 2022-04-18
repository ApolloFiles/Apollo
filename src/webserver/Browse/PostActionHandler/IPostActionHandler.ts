import express from 'express';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';

export default interface IPostActionHandler {
  getActionKey(): string;

  handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, postValue: string): Promise<void>;
}
