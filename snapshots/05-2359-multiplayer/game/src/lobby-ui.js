/**
 * DOM overlay for lobby (room list, create, join, ready)
 */

const STYLE = `
#lobby {
  position: fixed;
  inset: 0;
  background: #111;
  color: #eee;
  font-family: monospace;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
#lobby.hidden { display: none; }
#lobby h2 {
  font-size: 32px;
  margin-bottom: 24px;
  letter-spacing: 4px;
}
#lobby-content {
  min-width: 400px;
  max-width: 500px;
}
.lobby-section {
  margin-bottom: 16px;
}
.lobby-section h3 {
  font-size: 14px;
  color: #888;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.room-item {
  background: #222;
  border: 1px solid #444;
  color: #eee;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.room-item:hover {
  background: #333;
  border-color: #888;
}
.room-item .room-players {
  color: #888;
  font-size: 12px;
}
.lobby-btn {
  background: #222;
  border: 1px solid #444;
  color: #eee;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 16px;
  cursor: pointer;
  margin-right: 8px;
  margin-bottom: 8px;
}
.lobby-btn:hover {
  background: #333;
  border-color: #888;
}
.lobby-btn.primary {
  border-color: #4a8;
  color: #4a8;
}
.lobby-btn.primary:hover {
  background: #1a3a2a;
}
.lobby-btn.danger {
  border-color: #a44;
  color: #a44;
}
.lobby-input {
  background: #1a1a1a;
  border: 1px solid #444;
  color: #eee;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  margin-right: 8px;
  margin-bottom: 8px;
  width: 180px;
}
.lobby-input:focus {
  outline: none;
  border-color: #888;
}
.lobby-select {
  background: #1a1a1a;
  border: 1px solid #444;
  color: #eee;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  margin-right: 8px;
  margin-bottom: 8px;
}
#lobby-players {
  margin-top: 8px;
}
.player-item {
  padding: 6px 12px;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #333;
}
.player-item .ready-badge {
  color: #4a8;
  font-size: 12px;
}
.player-item .not-ready {
  color: #888;
  font-size: 12px;
}
#lobby-hint {
  margin-top: 16px;
  color: #555;
  font-size: 12px;
}
`;

export function createLobbyUI(maps) {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'lobby';
  el.innerHTML = `
    <h2>MULTIPLAYER</h2>
    <div id="lobby-content">
      <div id="lobby-browse" class="lobby-section">
        <h3>Rooms</h3>
        <div id="room-list">No rooms available</div>
        <div style="margin-top: 8px">
          <input id="room-name-input" class="lobby-input" placeholder="Room name" />
          <select id="map-select" class="lobby-select"></select>
          <button id="create-room-btn" class="lobby-btn primary">Create</button>
        </div>
        <button id="refresh-btn" class="lobby-btn">Refresh</button>
      </div>
      <div id="lobby-room" class="lobby-section" style="display:none">
        <h3>Room: <span id="lobby-room-name"></span></h3>
        <div id="lobby-players"></div>
        <div style="margin-top: 12px">
          <button id="ready-btn" class="lobby-btn primary">Ready</button>
          <button id="leave-btn" class="lobby-btn danger">Leave</button>
        </div>
      </div>
      <div style="margin-top: 12px">
        <button id="back-btn" class="lobby-btn">Back to Menu</button>
      </div>
    </div>
    <div id="lobby-hint">Create or join a room to play</div>
  `;
  document.body.appendChild(el);

  // Populate map select
  const mapSelect = el.querySelector('#map-select');
  for (const map of maps) {
    const opt = document.createElement('option');
    opt.value = map.id;
    opt.textContent = map.name || map.id;
    mapSelect.appendChild(opt);
  }

  let currentRoomId = null;
  let callbacks = {};

  function setCallbacks(cbs) {
    callbacks = cbs;
  }

  // Button handlers
  el.querySelector('#create-room-btn').onclick = () => {
    const name = el.querySelector('#room-name-input').value || 'Race Room';
    const mapId = mapSelect.value;
    if (callbacks.onCreate) callbacks.onCreate(name, mapId);
  };

  el.querySelector('#refresh-btn').onclick = () => {
    if (callbacks.onRefresh) callbacks.onRefresh();
  };

  el.querySelector('#ready-btn').onclick = () => {
    if (callbacks.onReady) callbacks.onReady();
  };

  el.querySelector('#leave-btn').onclick = () => {
    if (callbacks.onLeave) callbacks.onLeave();
    showBrowse();
  };

  el.querySelector('#back-btn').onclick = () => {
    if (callbacks.onBack) callbacks.onBack();
  };

  function showBrowse() {
    el.querySelector('#lobby-browse').style.display = '';
    el.querySelector('#lobby-room').style.display = 'none';
    currentRoomId = null;
  }

  function showRoom(roomId, roomName) {
    el.querySelector('#lobby-browse').style.display = 'none';
    el.querySelector('#lobby-room').style.display = '';
    el.querySelector('#lobby-room-name').textContent = roomName || roomId;
    currentRoomId = roomId;
  }

  function updateRoomList(rooms) {
    const list = el.querySelector('#room-list');
    if (rooms.length === 0) {
      list.textContent = 'No rooms available';
      return;
    }
    list.innerHTML = '';
    for (const room of rooms) {
      const div = document.createElement('div');
      div.className = 'room-item';
      div.innerHTML = `
        <span>${room.name} <span style="color:#666">(${room.mapId})</span></span>
        <span class="room-players">${room.players}/${room.maxPlayers}</span>
      `;
      div.onclick = () => {
        if (callbacks.onJoin) callbacks.onJoin(room.id);
      };
      list.appendChild(div);
    }
  }

  function updatePlayers(players, myPlayerId) {
    const container = el.querySelector('#lobby-players');
    container.innerHTML = '';
    for (const p of players) {
      const div = document.createElement('div');
      div.className = 'player-item';
      const isMe = p.id === myPlayerId;
      div.innerHTML = `
        <span>${isMe ? '> ' : ''}Player ${p.slot + 1}${isMe ? ' (you)' : ''}</span>
        <span class="${p.ready ? 'ready-badge' : 'not-ready'}">${p.ready ? 'READY' : 'waiting'}</span>
      `;
      container.appendChild(div);
    }
  }

  function show() {
    el.classList.remove('hidden');
    showBrowse();
  }

  function hide() {
    el.classList.add('hidden');
  }

  function destroy() {
    el.remove();
    style.remove();
  }

  return {
    el,
    setCallbacks,
    showBrowse,
    showRoom,
    updateRoomList,
    updatePlayers,
    show,
    hide,
    destroy,
  };
}
