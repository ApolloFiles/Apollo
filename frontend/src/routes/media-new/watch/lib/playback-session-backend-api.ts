import { dev } from '$app/environment';
import type { RegenerateJoinTokenResponse } from '../../../../../../src/webserver/Api/v0/media/player-session';
import type { PlayerSessionInfoResponse } from '../../../../../../src/webserver/Api/v0/media/player-session/info';

// TODO: I don't like having mock/dev data here :<

function getSessionId(): string | null {
  return new URL(location.href).searchParams.get('session');
}

export async function fetchPlaybackSessionInfo(): Promise<PlayerSessionInfoResponse> {
  const sessionId = getSessionId();

  if (dev) {
    console.warn('Using mock data for playback session info in development mode.');
    return {
      session: {
        id: sessionId ?? 'fake-session-id',
        yourId: sessionId == null ? 'owner-id' : 'participant-1',
        participants: {
          owner: {
            id: 'owner-id',
            displayName: 'Owner Name',
            connected: true,
          },
          otherParticipants: [
            {
              id: 'participant-1',
              displayName: 'Participant One',
              connected: true,
            },
            {
              id: 'participant-2',
              displayName: 'Participant Two',
              connected: false,
            },
          ],
          total: 3,
        },
      },
      playbackStatus: null,
    };
  }

  const playbackStatusResponse = await fetch(`/api/v0/media/player-session/info?session=${sessionId ?? ''}`, { headers: { Accept: 'application/json' } });
  if (!playbackStatusResponse.ok) {
    throw new Error(`player-session/info endpoint responded with Status ${playbackStatusResponse.status}: ${await playbackStatusResponse.text()}`);
  }
  return await playbackStatusResponse.json();
}

export async function regenerateJoinToken(sessionId: string): Promise<RegenerateJoinTokenResponse> {
  if (dev) {
    console.warn('Generating mock join token in development mode.');

    function sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    await sleep(1500);

    const joinToken = `regenerated-${Date.now()}`;
    return {
      shareUrl: `${location.protocol}//${location.host}/join?token=${encodeURIComponent(joinToken)}`,
      joinToken: {
        token: joinToken,
        expiresInSeconds: 3600,
      },
    };
  }

  const playbackStatusResponse = await fetch(
    `/api/v0/media/player-session/regenerate-join-token?session=${sessionId}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  if (!playbackStatusResponse.ok) {
    throw new Error(`player-session/info endpoint responded with Status ${playbackStatusResponse.status}: ${await playbackStatusResponse.text()}`);
  }
  return await playbackStatusResponse.json();
}
