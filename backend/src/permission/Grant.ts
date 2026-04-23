import type Context from './Context.js';

export default abstract class Grant<C extends Context<any, any, any>> {
  abstract check(ctx: C): boolean | Promise<boolean>;
}
