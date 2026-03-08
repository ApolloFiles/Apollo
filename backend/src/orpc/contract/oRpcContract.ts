import type { InferContractRouterOutputs } from '@orpc/contract';
import { adminContract } from './sub-contracts/admin.js';
import { authContract } from './sub-contracts/auth.js';
import { filesContract } from './sub-contracts/files.js';
import { mediaContract } from './sub-contracts/media.js';
import { sessionContract } from './sub-contracts/session.js';
import { tmpBackendContract } from './sub-contracts/tmp-backend.js';
import { userContract } from './sub-contracts/user.js';

export type ORpcContractOutputs = InferContractRouterOutputs<typeof oRpcContract>;

export const oRpcContract = {
  tmpBackend: tmpBackendContract,

  user: userContract,
  session: sessionContract,

  auth: authContract,

  files: filesContract,
  media: mediaContract,

  admin: adminContract,
};
