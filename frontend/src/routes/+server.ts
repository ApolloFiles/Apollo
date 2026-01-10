import { rpcClient } from '$lib/oRPC';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ cookies, fetch }): Promise<never> => {
  const sessionUser = await rpcClient.session.get(undefined, { context: { cookies, fetch } });
  if (sessionUser == null) {
    redirect(303, '/login');
  } else {
    // TODO: User should have a setting to choose their default app or something (and maybe admin/Apollo can set a global default)
    redirect(303, '/media');
  }
};
