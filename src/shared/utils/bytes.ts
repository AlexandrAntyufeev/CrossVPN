export function gigabytesToBytes(value: number): bigint {
  return BigInt(value) * 1024n * 1024n * 1024n;
}
