/**
 * Minimal level-select menu.
 * Dark, monospace, debug-friendly. Number keys for quick select.
 */

const STYLE = `
#menu {
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
#menu.hidden { display: none; }
#menu h1 {
  font-size: 48px;
  margin-bottom: 32px;
  letter-spacing: 12px;
}
#map-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 300px;
}
.map-btn {
  background: #222;
  border: 1px solid #444;
  color: #eee;
  font-family: monospace;
  font-size: 16px;
  padding: 10px 16px;
  cursor: pointer;
  text-align: left;
}
.map-btn:hover, .map-btn:focus {
  background: #333;
  border-color: #888;
  outline: none;
}
.map-btn .key {
  color: #888;
  margin-right: 8px;
}
.map-btn .meta {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
#mp-btn {
  background: #1a2a3a;
  border: 1px solid #4a8;
  color: #4a8;
  font-family: monospace;
  font-size: 16px;
  padding: 12px 16px;
  cursor: pointer;
  text-align: center;
  margin-top: 16px;
  min-width: 300px;
  letter-spacing: 2px;
}
#mp-btn:hover {
  background: #2a3a4a;
  border-color: #6ca;
}
#menu-hint {
  margin-top: 24px;
  color: #555;
  font-size: 12px;
}
`;

export function createMenu(onSelect, onMultiplayer) {
  // Inject styles once
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'menu';
  el.innerHTML = `
    <h1>KART</h1>
    <div id="map-list">Loading maps...</div>
    <button id="mp-btn">MULTIPLAYER</button>
    <div id="menu-hint"></div>
  `;
  document.body.appendChild(el);

  el.querySelector('#mp-btn').onclick = () => {
    if (onMultiplayer) onMultiplayer();
  };

  let currentMaps = [];
  let loading = false;

  function onKeyDown(e) {
    if (loading) return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= currentMaps.length) {
      onSelect(currentMaps[n - 1].id);
    }
  }

  function bindKeys() {
    window.addEventListener('keydown', onKeyDown);
  }
  function unbindKeys() {
    window.removeEventListener('keydown', onKeyDown);
  }

  bindKeys();

  return {
    el,

    showMaps(maps) {
      loading = false;
      currentMaps = maps;
      const list = el.querySelector('#map-list');
      const hint = el.querySelector('#menu-hint');

      if (maps.length === 0) {
        list.textContent = 'No maps found in /maps/';
        hint.textContent = '';
        return;
      }

      list.innerHTML = '';
      maps.forEach((map, i) => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        const num = i + 1;
        btn.innerHTML = `
          <span class="key">[${num <= 9 ? num : '-'}]</span>${map.name || map.id}
          <div class="meta">${map.width || '?'}x${map.height || '?'} &middot; ${map.id}/</div>
        `;
        btn.onclick = () => onSelect(map.id);
        list.appendChild(btn);
      });

      hint.textContent = 'Press 1-9 to select · ESC during game to return';
    },

    showLoading(mapId) {
      loading = true;
      el.querySelector('#map-list').textContent = `Loading ${mapId}...`;
    },

    hide() {
      el.classList.add('hidden');
      unbindKeys();
    },

    show() {
      el.classList.remove('hidden');
      bindKeys();
    },
  };
}
