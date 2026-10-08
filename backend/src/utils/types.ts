export type DeepReadonly<T> =
  T extends Primitive | ((...args: never) => unknown) ? T
    : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
      : { readonly [K in keyof T]: DeepReadonly<T[K]> };

/** @see https://github.com/sindresorhus/type-fest/blob/313e04e894d882c044c6de28f69cfde87fff0947/source/literal-union.d.ts */
export type LiteralUnion<
  LiteralType,
  BaseType extends Primitive = string,
> = LiteralType | (BaseType & Record<never, never>);

/** @see https://github.com/sindresorhus/type-fest/blob/313e04e894d882c044c6de28f69cfde87fff0947/source/primitive.d.ts */
type Primitive =
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint;
