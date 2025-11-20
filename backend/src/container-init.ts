import 'reflect-metadata';
import Fs from 'node:fs';
import Path from 'node:path';
import Url from 'node:url';

// manual imports for 'auto' loading:
import './files/cache/ApolloFileSystemEventListener.js';

await recursiveAutoLoadMultiple(
  'webserver/routes',
);

async function recursiveAutoLoad(relativePath: string): Promise<Promise<void>[]> {
  const __dirname = Url.fileURLToPath(new URL('.', import.meta.url));
  const absolutePath = Path.join(__dirname, relativePath);

  const importPromises: Promise<void>[] = [];

  const dirHandle = await Fs.promises.opendir(absolutePath);
  for await (const dirent of dirHandle) {
    const direntPath = Path.join(dirent.parentPath, dirent.name);
    const fileExtension = Path.extname(dirent.name);

    if (dirent.isFile() && ['.js', '.ts'].includes(fileExtension)) {
      importPromises.push(import(direntPath));
    } else if (dirent.isDirectory()) {
      importPromises.push(...(await recursiveAutoLoad(Path.relative(__dirname, direntPath))));
    } else {
      if (fileExtension !== '.map') {
        console.warn('Unable to auto-load unsupported file type: ' + direntPath);
      }
    }
  }

  return importPromises;
}

async function recursiveAutoLoadMultiple(...relativePaths: string[]): Promise<void> {
  const allPromises: Promise<void>[] = [];
  for (const relativePath of relativePaths) {
    allPromises.push(...(await recursiveAutoLoad(relativePath)));
  }
  await Promise.all(allPromises);
}
