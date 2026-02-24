/**
 * Lobby protocol — create/join/list rooms, ready state
 */
export class LobbyClient {
  constructor(connection) {
    this.conn = connection;
    this.onRooms = null;
    this.onJoined = null;
    this.onUpdate = null;
    this.onGameInit = null;
    this.onError = null;

    this.conn.on('lobby:rooms', (msg) => {
      if (this.onRooms) this.onRooms(msg.rooms);
    });

    this.conn.on('lobby:joined', (msg) => {
      if (this.onJoined) this.onJoined(msg.roomId, msg.playerId);
    });

    this.conn.on('lobby:update', (msg) => {
      if (this.onUpdate) this.onUpdate(msg.players);
    });

    this.conn.on('lobby:error', (msg) => {
      if (this.onError) this.onError(msg.message);
    });

    this.conn.on('game:init', (msg) => {
      if (this.onGameInit) this.onGameInit(msg);
    });
  }

  listRooms() {
    this.conn.send({ type: 'lobby:list' });
  }

  createRoom(name, mapId) {
    this.conn.send({ type: 'lobby:create', name, mapId });
  }

  joinRoom(roomId) {
    this.conn.send({ type: 'lobby:join', roomId });
  }

  leaveRoom() {
    this.conn.send({ type: 'lobby:leave' });
  }

  toggleReady() {
    this.conn.send({ type: 'lobby:ready' });
  }

  destroy() {
    this.conn.off('lobby:rooms');
    this.conn.off('lobby:joined');
    this.conn.off('lobby:update');
    this.conn.off('lobby:error');
    this.conn.off('game:init');
  }
}
