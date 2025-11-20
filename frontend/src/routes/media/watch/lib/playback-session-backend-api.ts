import type { PlayerSessionInfoResponse, RegenerateJoinTokenResponse } from '../../legacy-types';

function getSessionId(): string | null {
  return new URL(location.href).searchParams.get('session');
}

export async function fetchPlaybackSessionInfo(): Promise<PlayerSessionInfoResponse> {
  const sessionId = getSessionId();

  const playbackStatusResponse = await fetch(`/api/_frontend/media/player-session/info${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`, { headers: { Accept: 'application/json' } });
  if (!playbackStatusResponse.ok) {
    throw new Error(`player-session/info endpoint responded with Status ${playbackStatusResponse.status}: ${await playbackStatusResponse.text()}`);
  }
  return await playbackStatusResponse.json();
}

export async function regenerateJoinToken(sessionId: string): Promise<RegenerateJoinTokenResponse> {
  const playbackStatusResponse = await fetch(
    `/api/_frontend/media/player-session/${encodeURIComponent(sessionId)}/regenerate-join-token`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  if (!playbackStatusResponse.ok) {
    throw new Error(`player-session/info endpoint responded with Status ${playbackStatusResponse.status}: ${await playbackStatusResponse.text()}`);
  }
  return await playbackStatusResponse.json();
}
