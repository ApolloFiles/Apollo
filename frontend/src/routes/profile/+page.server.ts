import { rpcClient } from '$lib/oRPC';

export async function load({ cookies, fetch }) {
  const userProfile = await rpcClient.session.getFullProfile(undefined, { context: { cookies, fetch } });
  return { userProfile };
}
