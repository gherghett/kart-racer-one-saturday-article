const statusEl = document.getElementById('status');
const gamepadsEl = document.getElementById('gamepads');
const logEl = document.getElementById('log');

const prevButtons = {};
const prevAxes = {};

window.addEventListener('gamepadconnected', (e) => {
  log(`Gamepad connected: ${e.gamepad.id} (mapping: "${e.gamepad.mapping}")`, 'press');
  statusEl.textContent = `Connected: ${e.gamepad.id}`;
});

window.addEventListener('gamepaddisconnected', (e) => {
  log(`Gamepad disconnected: ${e.gamepad.id}`, 'release');
  statusEl.textContent = 'Press a button on your controller to connect...';
});

function log(msg, type = '') {
  const line = document.createElement('div');
  if (type) line.className = `log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(line);
  while (logEl.children.length > 100) logEl.lastChild.remove();
}

function update() {
  requestAnimationFrame(update);

  const gamepads = navigator.getGamepads();
  let html = '';

  for (const gp of gamepads) {
    if (!gp) continue;

    if (!prevButtons[gp.index]) {
      prevButtons[gp.index] = new Array(gp.buttons.length).fill(false);
      prevAxes[gp.index] = new Array(gp.axes.length).fill(0);
    }
    const prev = prevButtons[gp.index];
    const prevAx = prevAxes[gp.index];

    // Buttons — show raw index only
    let buttonsHtml = '';
    const pressedList = [];
    for (let i = 0; i < gp.buttons.length; i++) {
      const pressed = gp.buttons[i].pressed;
      const value = gp.buttons[i].value;
      const cls = pressed ? 'btn pressed' : 'btn';
      const label = value > 0 && value < 1 ? `${i}\n${value.toFixed(1)}` : `${i}`;
      buttonsHtml += `<div class="${cls}">${label}</div>`;

      if (pressed) pressedList.push(`btn${i}`);

      if (pressed && !prev[i]) {
        log(`btn[${i}] PRESSED` + (pressedList.length > 1 ? `  (held: ${pressedList.join('+')})` : ''), 'press');
      }
      if (!pressed && prev[i]) {
        log(`btn[${i}] RELEASED`, 'release');
      }
      prev[i] = pressed;
    }

    // Axes — show raw index, log when crossing threshold
    let axesHtml = '';
    for (let i = 0; i < gp.axes.length; i++) {
      const v = gp.axes[i];
      const left = ((v + 1) / 2 * 100);
      const width = 4;
      const active = Math.abs(v) > 0.3;
      axesHtml += `
        <div class="axis">
          <div class="axis-bar" style="${active ? 'outline:1px solid #44ff44' : ''}">
            <div class="axis-fill" style="left:${Math.max(0, left - width/2)}%;width:${width}%"></div>
          </div>
          <div class="axis-label" style="${active ? 'color:#44ff44' : ''}">axis[${i}]: ${v.toFixed(3)}</div>
        </div>`;

      // Log axis changes past threshold
      const wasActive = Math.abs(prevAx[i]) > 0.5;
      const isActive = Math.abs(v) > 0.5;
      if (isActive && !wasActive) {
        log(`axis[${i}] = ${v.toFixed(2)}`, 'press');
      }
      prevAx[i] = v;
    }

    const simul = pressedList.length > 0
      ? `<div style="color:#ffaa00;margin-top:8px;font-size:16px">Held: ${pressedList.join(' + ')}</div>`
      : '';

    html += `
      <div class="gamepad">
        <h2>Pad ${gp.index}: ${gp.id}</h2>
        <div style="color:#888;margin-bottom:8px">mapping: "${gp.mapping}" | buttons: ${gp.buttons.length} | axes: ${gp.axes.length}</div>
        <div class="buttons">${buttonsHtml}</div>
        <div class="axes">${axesHtml}</div>
        ${simul}
      </div>`;
  }

  if (html) gamepadsEl.innerHTML = html;
}

requestAnimationFrame(update);
