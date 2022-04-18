import express from 'express';
import Fs from 'fs';

export const adminRouter = express.Router();

adminRouter.use((req, res, next) => {
  const fileDescriptors = Fs.readdirSync('/proc/self/fd');

  let responseStr = '';
  for (const fileDescriptor of fileDescriptors) {
    try {
      const linkTarget = Fs.readlinkSync(`/proc/self/fd/${fileDescriptor}`);

      if (linkTarget.startsWith('socket:[') && linkTarget.endsWith(']')) {
        continue;
      }
      if (linkTarget.startsWith('pipe:[') && linkTarget.endsWith(']')) {
        continue;
      }
      if (linkTarget.startsWith('anon_inode:[') && linkTarget.endsWith(']')) {
        continue;
      }
      if (linkTarget.startsWith('/dev/pts/')) {
        continue;
      }
      if (linkTarget == '/dev/null') {
        continue;
      }

      if (responseStr.length == 0) {
        responseStr += '<ul>';
      }

      responseStr += `<li><pre>${fileDescriptor}: ${linkTarget}</pre></li>\n`;
    } catch (err) {
    }
  }

  if (responseStr.length > 0) {
    responseStr += '</ul>';
  }

  res
      .type('text/html')
      .send(responseStr || '<strong>No open file descriptors</strong>');
});
