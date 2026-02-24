/**
 * LobbyManager — room creation/join, client tracking
 */
import { GameRoom } from './room.js';

let nextRoomId = 1;

export class LobbyManager {
  constructor() {
    this.rooms = new Map();    // roomId → GameRoom
    this.clients = new Map();  // ws → { playerId, roomId }
  }

  addClient(ws) {
    const playerId = 'p' + Math.random().toString(36).slice(2, 8);
    this.clients.set(ws, { playerId, roomId: null });
    return playerId;
  }

  removeClient(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (client.roomId) {
      const room = this.rooms.get(client.roomId);
      if (room) {
        room.removePlayer(client.playerId);
        this._broadcastRoomUpdate(room);
        if (room.playerCount === 0 && !room.running) {
          this.rooms.delete(client.roomId);
        }
      }
    }
    this.clients.delete(ws);
  }

  handleMessage(ws, msg) {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (msg.type) {
      case 'lobby:list':
        this._sendRoomList(ws);
        break;

      case 'lobby:create': {
        // Leave current room first
        if (client.roomId) this._leaveRoom(ws, client);

        const roomId = 'room' + (nextRoomId++);
        const room = new GameRoom(roomId, msg.name || roomId, msg.mapId);
        this.rooms.set(roomId, room);
        room.addPlayer(client.playerId, ws);
        client.roomId = roomId;

        this._send(ws, { type: 'lobby:joined', roomId, playerId: client.playerId });
        this._broadcastRoomUpdate(room);
        this._broadcastRoomList();
        break;
      }

      case 'lobby:join': {
        if (client.roomId) this._leaveRoom(ws, client);

        const room = this.rooms.get(msg.roomId);
        if (!room || room.running || room.playerCount >= 4) {
          this._send(ws, { type: 'lobby:error', message: 'Cannot join room' });
          return;
        }

        room.addPlayer(client.playerId, ws);
        client.roomId = msg.roomId;
        this._send(ws, { type: 'lobby:joined', roomId: msg.roomId, playerId: client.playerId });
        this._broadcastRoomUpdate(room);
        this._broadcastRoomList();
        break;
      }

      case 'lobby:leave':
        if (client.roomId) {
          this._leaveRoom(ws, client);
          this._broadcastRoomList();
        }
        break;

      case 'lobby:ready': {
        const room = client.roomId ? this.rooms.get(client.roomId) : null;
        if (!room) return;
        room.toggleReady(client.playerId);
        this._broadcastRoomUpdate(room);

        // Check if all players ready → start game
        if (room.allReady() && room.playerCount >= 1) {
          room.startGame();
        }
        break;
      }

      case 'input': {
        const room = client.roomId ? this.rooms.get(client.roomId) : null;
        if (room && room.running) {
          room.handleInput(client.playerId, msg.seq, msg.input);
        }
        break;
      }
    }
  }

  _leaveRoom(ws, client) {
    const room = this.rooms.get(client.roomId);
    if (room) {
      room.removePlayer(client.playerId);
      this._broadcastRoomUpdate(room);
      if (room.playerCount === 0 && !room.running) {
        this.rooms.delete(client.roomId);
      }
    }
    client.roomId = null;
  }

  _sendRoomList(ws) {
    const rooms = [];
    for (const [id, room] of this.rooms) {
      if (!room.running) {
        rooms.push({
          id,
          name: room.name,
          mapId: room.mapId,
          players: room.playerCount,
          maxPlayers: 4,
        });
      }
    }
    this._send(ws, { type: 'lobby:rooms', rooms });
  }

  _broadcastRoomList() {
    for (const [ws, client] of this.clients) {
      if (!client.roomId) {
        this._sendRoomList(ws);
      }
    }
  }

  _broadcastRoomUpdate(room) {
    const players = room.getPlayerList();
    const msg = { type: 'lobby:update', players };
    for (const p of room.players.values()) {
      if (p.ws) this._send(p.ws, msg);
    }
  }

  _send(ws, data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}
