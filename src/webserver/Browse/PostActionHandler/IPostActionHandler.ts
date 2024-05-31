import express from 'express';
import ApolloUser from '../../../user/ApolloUser';
import VirtualFile from '../../../user/files/VirtualFile';

export default interface IPostActionHandler {
  getActionKey(): string;

  // FIXME: The current way of using postValue and newPostValue sucks.
  handle(req: express.Request, res: express.Response, user: ApolloUser, file: VirtualFile | null, frontendType: 'browse' | 'trash', postValue: string, newPostValue?: string): Promise<void>;
}
