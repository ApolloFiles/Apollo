import ApolloVideoPlayer from './VideoPlayer/ApolloVideoPlayer';
import LiveTranscodeVideoWrapper from './VideoPlayer/LiveTranscodeVideoWrapper';

document.addEventListener('DOMContentLoaded', () => {
  if (window.ApolloData?.LiveTranscode == null) {
    throw new Error('ApolloData.LiveTranscode is not defined');
  }

  const videoContainer = document.getElementById('videoContainer');
  if (videoContainer == null) {
    throw new Error('Unable to find videoContainer element');
  }

  const videoPlayer = new ApolloVideoPlayer(videoContainer);

  const ws = new WebSocket(location.origin.toString().replace(/http/, 'ws') + '/' + window.ApolloData.LiveTranscode.sessionId, 'live-transcode');
  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'start') {
        videoPlayer.loadMedia(message.manifestUri, 'live_transcode')
            .then(() => (videoPlayer.videoWrapper as LiveTranscodeVideoWrapper).duration = message.duration)
            .catch(console.error);
        return;
      }

      console.error('Unknown message type:', message);
    } catch (err) {
      console.error('Unable to parse received message:', event.data);
      console.error(err);
    }
  });
});
