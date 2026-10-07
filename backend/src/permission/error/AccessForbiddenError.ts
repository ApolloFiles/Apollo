import { NotFoundError } from '@sprax/node-framework';

// FIXME: oRPC should automatically translate HttpErrors too

/**
 * This error is intended to be used by permission checking components and
 * automatically results in an error 404 response, if not manually handled
 */
export default class AccessForbiddenError extends NotFoundError {
}
