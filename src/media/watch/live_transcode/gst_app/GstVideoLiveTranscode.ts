import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Path from 'node:path';
import Utils from '../../../../Utils';
import { BackendDebugInfoMessage } from '../../sessions/CommunicationProtocol';
import WrappedGstAppProcess from './GstAppProcessWrapper';

export default class GstVideoLiveTranscode {
  static async startTranscode(videoPath: string, targetDir: string, onDebugData: (debugData: BackendDebugInfoMessage['data']) => void): Promise<WrappedGstAppProcess> {
    if (!Path.isAbsolute(videoPath)) {
      throw new Error('videoPath must be absolute');
    }
    if (!Path.isAbsolute(targetDir)) {
      throw new Error('targetDir must be absolute');
    }

    if (!Fs.existsSync(targetDir)) {
      throw new Error('targetDir does not exist');
    }

    const fileUri = `file://${Utils.encodeUriProperly(videoPath)}`;

    const command = '/home/christian/Downloads/apollo-g-streamer/cmake-build-debug/apollo_g_streamer' /* TODO */;
    const args = [fileUri];
    const gstProcess = ChildProcess.spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: targetDir
        }
    );

    return WrappedGstAppProcess.wrapAndInitialize(gstProcess, targetDir, onDebugData);
  }
}
