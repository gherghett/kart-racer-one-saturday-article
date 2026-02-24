/**
 * HTTP + WebSocket server entry point
 */
import http from 'http';
import { WebSocketServer } from 'ws';
import { LobbyManager } from './lobby.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Kart game server');
});

const wss = new WebSocketServer({ server });
const lobby = new LobbyManager();

wss.on('connection', (ws) => {
  const playerId = lobby.addClient(ws);
  console.log(`Player connected: ${playerId}`);

  // Send welcome with playerId
  ws.send(JSON.stringify({ type: 'welcome', playerId }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      lobby.handleMessage(ws, msg);
    } catch (e) {
      console.error('Bad message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
    lobby.removeClient(ws);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${playerId}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Kart server listening on port ${PORT}`);
});
