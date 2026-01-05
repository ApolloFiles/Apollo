import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = (): never => {
  redirect(302, '/admin/users');
};
