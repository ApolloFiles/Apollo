import Utils from '../src/Utils';

describe('#prettifyFileSize', () => {
  const expectedErrorMessage = 'The given bytes need to be a positive number';

  test('For non SI units', () => {
    expect(Utils.prettifyFileSize(0)).toBe('0 B');
    expect(Utils.prettifyFileSize(1)).toBe('1 B');
    expect(Utils.prettifyFileSize(1024)).toBe('1.00 KiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 2))).toBe('1.00 MiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 3))).toBe('1.00 GiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 4))).toBe('1.00 TiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 5))).toBe('1.00 PiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 6))).toBe('1.00 EiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 7))).toBe('1.00 ZiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 8))).toBe('1.00 YiB');

    expect(Utils.prettifyFileSize(Math.pow(1024, 9))).toBe('1024.00 YiB');
    expect(Utils.prettifyFileSize(Math.pow(1024, 10))).toBe('1048576.00 YiB');

    expect(Utils.prettifyFileSize(1024 + 512)).toBe('1.50 KiB');
  });

  test('For SI units', () => {
    expect(Utils.prettifyFileSize(0, true)).toBe('0 B');
    expect(Utils.prettifyFileSize(1, true)).toBe('1 B');
    expect(Utils.prettifyFileSize(1000, true)).toBe('1.00 kB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 2), true)).toBe('1.00 MB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 3), true)).toBe('1.00 GB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 4), true)).toBe('1.00 TB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 5), true)).toBe('1.00 PB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 6), true)).toBe('1.00 EB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 7), true)).toBe('1.00 ZB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 8), true)).toBe('1.00 YB');

    expect(Utils.prettifyFileSize(Math.pow(1000, 9), true)).toBe('1000.00 YB');
    expect(Utils.prettifyFileSize(Math.pow(1000, 10), true)).toBe('1000000.00 YB');

    expect(Utils.prettifyFileSize(1500, true)).toBe('1.50 kB');
  });

  test('With negative bytes', () => {
    expect(() => Utils.prettifyFileSize(-1)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(Number.MIN_SAFE_INTEGER)).toThrowError(expectedErrorMessage);

    expect(() => Utils.prettifyFileSize(-1, true)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(Number.MIN_SAFE_INTEGER, true)).toThrowError(expectedErrorMessage);
  });

  test('With invalid values for bytes', () => {
    expect(() => Utils.prettifyFileSize(Number.NaN)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(undefined as any)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(null as any)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize('10' as any)).toThrowError(expectedErrorMessage);

    expect(() => Utils.prettifyFileSize(Number.NaN, true)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(undefined as any, true)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize(null as any, true)).toThrowError(expectedErrorMessage);
    expect(() => Utils.prettifyFileSize('10' as any, true)).toThrowError(expectedErrorMessage);
  });
});
