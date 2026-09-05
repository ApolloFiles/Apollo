import { oc } from '@orpc/contract';

export const ERROR_CODE_REQUESTED_ENTITY_NOT_FOUND = 'REQUESTED_ENTITY_NOT_FOUND';

// TODO: Maybe we can type-hint errors on the individual contracts, instead of having *all* here
export const baseOc = oc
  .errors({
    UNAUTHORIZED: { status: 401 },
    NO_PERMISSIONS: { status: 403 },
    INVALID_INPUT: { status: 400 },
    NOT_AVAILABLE_FOR_LOGGED_IN_USER: { status: 409 },
    FEATURE_DISABLED: { status: 403 },
    [ERROR_CODE_REQUESTED_ENTITY_NOT_FOUND]: { status: 404 },
    UNSUPPORTED_FILE: { status: 422 },
  });
