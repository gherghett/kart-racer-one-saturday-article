/**
 * Snapshot buffer + lerp between two snapshots at 100ms delay
 */
const INTERP_DELAY = 100; // ms behind latest snapshot

export class InterpolationBuffer {
  constructor() {
    this.snapshots = []; // { serverTime, karts, race, events, eventsConsumed }
    this.snapshotCount = 0;
    this._lastReconcileTick = -1;
  }

  push(snapshot) {
    const now = performance.now();
    this.snapshotCount++;

    this.snapshots.push({
      serverTime: now,
      karts: snapshot.karts,
      race: snapshot.race,
      events: snapshot.events || [],
      eventsConsumed: false,
      tick: snapshot.tick,
      lastInputSeq: snapshot.lastInputSeq,
    });

    // Keep only last 30 snapshots (1.5 seconds at 20Hz)
    if (this.snapshots.length > 30) {
      this.snapshots.shift();
    }
  }

  /**
   * Get interpolated state for remote karts at render time.
   * Events are returned only once (consumed on first read).
   */
  getInterpolatedState() {
    if (this.snapshots.length < 2) {
      if (this.snapshots.length === 1) {
        const snap = this.snapshots[0];
        const events = snap.eventsConsumed ? [] : snap.events;
        snap.eventsConsumed = true;
        return { karts: snap.karts, race: snap.race, events, tick: snap.tick, lastInputSeq: snap.lastInputSeq, t: 1 };
      }
      return null;
    }

    const renderTime = performance.now() - INTERP_DELAY;

    // Find the two snapshots to interpolate between
    let from = this.snapshots[0];
    let to = this.snapshots[1];

    for (let i = 1; i < this.snapshots.length; i++) {
      if (this.snapshots[i].serverTime > renderTime) {
        to = this.snapshots[i];
        from = this.snapshots[i - 1];
        break;
      }
      if (i === this.snapshots.length - 1) {
        from = this.snapshots[i - 1];
        to = this.snapshots[i];
      }
    }

    const range = to.serverTime - from.serverTime;
    const t = range > 0 ? Math.max(0, Math.min(1, (renderTime - from.serverTime) / range)) : 1;

    // Interpolate karts
    const karts = to.karts.map((toK) => {
      const fromK = from.karts.find(k => k.id === toK.id);
      if (!fromK) return { ...toK };

      return {
        id: toK.id,
        x: fromK.x + (toK.x - fromK.x) * t,
        y: fromK.y + (toK.y - fromK.y) * t,
        z: fromK.z + (toK.z - fromK.z) * t,
        ry: lerpAngle(fromK.ry, toK.ry, t),
        speed: fromK.speed + (toK.speed - fromK.speed) * t,
        steerAngle: fromK.steerAngle + (toK.steerAngle - fromK.steerAngle) * t,
        slideActive: t >= 0.5 ? toK.slideActive : fromK.slideActive,
        slideDir: toK.slideDir,
        slideAngle: fromK.slideAngle + (toK.slideAngle - fromK.slideAngle) * t,
        boostSpeed: fromK.boostSpeed + (toK.boostSpeed - fromK.boostSpeed) * t,
        boostTimer: fromK.boostTimer + (toK.boostTimer - fromK.boostTimer) * t,
        grounded: t >= 0.5 ? toK.grounded : fromK.grounded,
        heldItem: toK.heldItem,
        velocityY: fromK.velocityY + (toK.velocityY - fromK.velocityY) * t,
      };
    });

    // Collect unconsumed events only
    const events = [];
    for (const snap of this.snapshots) {
      if (!snap.eventsConsumed && snap.events.length > 0) {
        // Only consume events from snapshots we've passed in render time
        if (snap.serverTime <= renderTime + INTERP_DELAY * 0.5) {
          events.push(...snap.events);
          snap.eventsConsumed = true;
        }
      }
    }

    return {
      karts,
      race: to.race,
      events,
      tick: to.tick,
      lastInputSeq: to.lastInputSeq,
      t,
    };
  }

  /**
   * Get the latest raw snapshot for reconciliation (not interpolated).
   * Returns null if no new snapshot since last call.
   */
  getLatestForReconciliation() {
    if (this.snapshots.length === 0) return null;
    const latest = this.snapshots[this.snapshots.length - 1];
    if (latest.tick === this._lastReconcileTick) return null;
    this._lastReconcileTick = latest.tick;
    return latest;
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  // Normalize to -PI..PI
  diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}
