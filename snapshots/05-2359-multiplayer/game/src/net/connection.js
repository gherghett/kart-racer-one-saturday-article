/**
 * WebSocket wrapper — connect, send, typed message handlers
 */
export class Connection {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.onClose = null;
    this.playerId = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'welcome') {
            this.playerId = msg.playerId;
          }
          const handler = this.handlers.get(msg.type);
          if (handler) handler(msg);
        } catch (err) {
          console.error('Bad server message:', err);
        }
      };

      this.ws.onclose = () => {
        if (this.onClose) this.onClose();
      };
    });
  }

  on(type, handler) {
    this.handlers.set(type, handler);
  }

  off(type) {
    this.handlers.delete(type);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
