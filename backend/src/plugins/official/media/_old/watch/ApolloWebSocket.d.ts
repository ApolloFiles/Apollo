import type { WebSocket } from 'ws';

export interface ApolloWebSocket extends WebSocket {
  apollo: {
    user?: ApolloUser;
    playerSessionId?: PlayerSession['id'];
    connectionId?: number;
    isAlive: boolean;

    pingRtt: number;
    lastPingTimestamp: number;
  };
}
