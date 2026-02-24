/**
 * In-game networking: send inputs at 20Hz, receive snapshots, accumulate tap inputs
 */
const SEND_RATE = 20; // Hz
const SEND_INTERVAL = 1000 / SEND_RATE;

export class GameClient {
  constructor(connection) {
    this.conn = connection;
    this.seq = 0;
    this.lastSendTime = 0;
    this.onSnapshot = null;

    // Tap accumulation: latch between sends
    this._pendingHopZTap = false;
    this._pendingHopXTap = false;
    this._pendingItemUseTap = false;

    this.conn.on('snapshot', (msg) => {
      if (this.onSnapshot) this.onSnapshot(msg);
    });
  }

  /**
   * Called every frame with current input state.
   * Accumulates taps and sends at 20Hz.
   */
  maybeSendInput(input, now) {
    // Accumulate taps
    if (input.hopZTap) this._pendingHopZTap = true;
    if (input.hopXTap) this._pendingHopXTap = true;
    if (input.itemUseTap) this._pendingItemUseTap = true;

    if (now - this.lastSendTime < SEND_INTERVAL) return null;
    this.lastSendTime = now;

    this.seq++;
    const payload = {
      accel: input.accel,
      steer: input.steer,
      hopZ: input.hopZ,
      hopX: input.hopX,
      hopZTap: this._pendingHopZTap,
      hopXTap: this._pendingHopXTap,
      itemUseTap: this._pendingItemUseTap,
    };

    this.conn.send({
      type: 'input',
      seq: this.seq,
      input: payload,
    });

    // Clear tap accumulation
    this._pendingHopZTap = false;
    this._pendingHopXTap = false;
    this._pendingItemUseTap = false;

    return { seq: this.seq, input: payload };
  }

  destroy() {
    this.conn.off('snapshot');
  }
}
