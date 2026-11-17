import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NETWORK_ROOM_NAME } from '../shared/network-schema.ts';
import { PaperKartRoom } from './PaperKartRoom.ts';

export const server = defineServer({
  transport: new WebSocketTransport({
    maxPayload: 1_500_000,
    pingInterval: 3_000,
    pingMaxRetries: 3,
  }),
  rooms: {
    [NETWORK_ROOM_NAME]: defineRoom(PaperKartRoom),
  },
  express: app => {
    app.get('/health', (_request, response) => response.json({ ok: true, game: 'Paper Kart' }));
  },
});
