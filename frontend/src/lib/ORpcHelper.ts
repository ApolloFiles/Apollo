import type { InferContractRouterOutputs } from '@orpc/contract';
import { oRpcContract } from '../../../backend/src/orpc/contract/oRpcContract';

export const ORpcContract = oRpcContract;
export type ORpcContractOutputs = InferContractRouterOutputs<typeof oRpcContract>;
