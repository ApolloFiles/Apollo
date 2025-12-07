export function jsonStringifyWithBigInt(value: any, space?: number): string {
  return JSON.stringify(
    value,
    (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    space,
  );
}
