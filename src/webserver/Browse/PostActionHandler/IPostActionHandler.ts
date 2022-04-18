import express from 'express';
import AbstractUser from '../../../AbstractUser';
import IUserFile from '../../../files/IUserFile';

export default interface IPostActionHandler {
  getActionKey(): string;

  // FIXME: The current way of using postValue and newPostValue sucks.
  handle(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, postValue: string, newPostValue?: string): Promise<void>;
}
