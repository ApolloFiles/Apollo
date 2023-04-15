import express from 'express';
import Fs from 'node:fs';
import ProcessBuilder from '../process_manager/ProcessBuilder';

export const adminRouter = express.Router();

adminRouter.use(async (req, res, next): Promise<void> => {
  const childProcess = await new ProcessBuilder('pgrep', ['--parent', process.pid.toString()])
      .bufferStdOut()
      .runPromised();

  if (childProcess.err) {
    return next(childProcess.err);
  }

  if (childProcess.code != 0 && childProcess.code != 1) {
    res.status(500)
        .send('Could not find child processes using pgrep');
    return;
  }

  const fileDescriptors = [];
  const processIds = [
    process.pid,
    ...childProcess.process.bufferedStdOut.toString('utf-8').split('\n')
  ];

  for (const pid of processIds) {
    try {
      for (const fd of Fs.readdirSync(`/proc/${pid}/fd`)) {
        const linkTarget = Fs.readlinkSync(`/proc/${pid}/fd/${fd}`);

        fileDescriptors.push({pid: parseInt(pid.toString(), 10), fd: parseInt(fd, 10), linkTarget});
      }
    } catch (err) {
    }
  }

  // Sorts by pid, then fd but current process is always first
  fileDescriptors.sort((a, b) => {
    if (a.pid == process.pid) {
      return -1;
    }
    if (b.pid == process.pid) {
      return 1;
    }

    return a.pid - b.pid || a.fd - b.fd;
  });

  let responseStr = '';
  responseStr += `<strong>Process ID:</strong> <pre style="display: inline">${process.pid}</pre><br>\n`;
  responseStr += `<strong>NVIDIA GPU in use:</strong> <pre style="display: inline">${fileDescriptors.some(fd => fd.linkTarget.startsWith('/dev/nvidia')) ? 'Yes' : 'No'}</pre><br>\n`;

  responseStr += '\n<hr>\n';

  let prevWasChildProcess = true;
  for (const fileDescriptor of fileDescriptors) {
    const linkTarget = fileDescriptor.linkTarget;
    const isChildProcess = fileDescriptor.pid !== process.pid;

    if (
        (linkTarget.startsWith('socket:[') && linkTarget.endsWith(']')) ||
        (linkTarget.startsWith('pipe:[') && linkTarget.endsWith(']')) ||
        (linkTarget.startsWith('anon_inode:[') && linkTarget.endsWith(']')) ||
        linkTarget.startsWith('/dev/pts/') ||
        linkTarget == '/dev/null' ||
        linkTarget.startsWith('/dev/nvidia')) {
      continue;
    }

    if (isChildProcess && !prevWasChildProcess) {
      responseStr += '\n<hr>\n';
    }

    if (responseStr.endsWith('\n<hr>\n')) {
      responseStr += '<ul>';
    }

    responseStr += `<li><pre style="display: inline">${fileDescriptor.fd}${isChildProcess ? ' (Child process ' + fileDescriptor.pid + ')' : ''}: ${linkTarget}</pre></li>\n`;

    prevWasChildProcess = isChildProcess;
  }

  if (responseStr.includes('<ul>')) {
    responseStr += '</ul>';
  } else {
    responseStr += '<pre>No open file descriptors</pre>';
  }

  res.type('text/html')
      .send(responseStr);
});
