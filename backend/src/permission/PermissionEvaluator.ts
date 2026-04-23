import type Context from './Context.js';
import AccessForbiddenError from './error/AccessForbiddenError.js';
import type Grant from './Grant.js';

export default abstract class PermissionEvaluator<C extends Context<any, any, any>> {
  private readonly grants: Grant<C>[];

  /**
   * @param grants Should be passed sorted (cheapest/most-likely ones first), for better performance
   */
  protected constructor(...grants: Grant<C>[]) {
    this.grants = grants;
  }

  async isAllowed(ctx: C): Promise<boolean> {
    for (const grant of this.grants) {
      if (await grant.check(ctx)) {
        return true;
      }
    }

    return false;
  }

  /**
   * @throws AccessForbiddenError
   */
  async ensureAllowed(ctx: C): Promise<void> {
    const allowed = await this.isAllowed(ctx);
    if (!allowed) {
      throw new AccessForbiddenError();
    }
  }
}
