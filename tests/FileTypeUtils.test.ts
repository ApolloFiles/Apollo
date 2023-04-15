import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import FileTypeUtils from '../src/FileTypeUtils';

// TODO: Mock FileTypeUtils to be independent of the file executable
describe('FileTypeUtils with and without file executable', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apollo-tests'));
  });

  afterEach(() => {
    Fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  test('Check if file executable is available on this system', () => {
    expect(FileTypeUtils.isFileAppAvailable()).toBe(true);
  });

  test.each([
    [true, 'text/html'],
    [false, 'text/plain'],
    [undefined, 'text/html']
  ])('Simple HTML file', async (useFileApp, expectedMimeType) => {
    const filePath = Path.join(tmpDir, 'hello.txt');
    Fs.writeFileSync(filePath, '<html><body>Hello Jester!</body></html>');

    const mimeType = new FileTypeUtils(useFileApp).getMimeType(filePath);

    await expect(mimeType).resolves.toBe(expectedMimeType);
  });

  test.each([true, false, undefined])('Empty file with css file extension', async (useFileApp) => {
    const filePath = Path.join(tmpDir, 'hello.css');
    Fs.writeFileSync(filePath, '');

    const mimeType = new FileTypeUtils(useFileApp).getMimeType(filePath);

    await expect(mimeType).resolves.toBe('text/css');
  });

  test.each([
    [true, 'text/plain'],
    [false, null],
    [undefined, 'text/plain']
  ])('Empty file without file extension', async (useFileApp, expectedMimeType) => {
    const filePath = Path.join(tmpDir, 'hello');
    Fs.writeFileSync(filePath, '');

    const mimeType = new FileTypeUtils(useFileApp).getMimeType(filePath);

    await expect(mimeType).resolves.toBe(expectedMimeType);
  });

  test.each([true, false, undefined])('Non existing file', async (useFileApp) => {
    const mimeType = new FileTypeUtils(useFileApp).getMimeType(Path.join(tmpDir, 'undefined'));

    await expect(mimeType).resolves.toBeNull();
  });
});
