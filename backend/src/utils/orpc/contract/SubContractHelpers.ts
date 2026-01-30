import { oc } from '@orpc/contract';

// TODO: Maybe we can type-hint errors on the individual contracts, instead of having *all* here
export const baseOc = oc
  .errors({
    UNAUTHORIZED: {},
    NO_PERMISSIONS: {},
    INVALID_INPUT: {},
    NOT_AVAILABLE_FOR_LOGGED_IN_USER: {},
    REQUESTED_ENTITY_NOT_FOUND: {},
    UNSUPPORTED_FILE: {},
  });
