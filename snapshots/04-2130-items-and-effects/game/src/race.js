/**
 * Race state manager — countdown, laps, checkpoints, finish-line crossing
 */

const TOTAL_LAPS = 3;
const CP_HIT_RADIUS = 30;
const CP_LOOKAHEAD = 4; // check this many checkpoints ahead
const COUNTDOWN_DURATION = 4; // seconds: 3, 2, 1, GO
const MIN_CP_FRACTION = 0.5; // must pass at least half the checkpoints before a line crossing counts
export const FINISH_LINE_WIDTH = 60; // world units — must match visual decal

export class RaceManager {
  /**
   * @param {Array<{x,z}>} checkpoints - world-space checkpoint positions
   * @param {Array<{kart, isPlayer}>} racers - racer objects
   * @param {{x,z,nx,nz}} finishLine - finish line origin + forward normal
   */
  constructor(checkpoints, racers, finishLine) {
    this.checkpoints = checkpoints;
    this.finishLine = finishLine; // {x, z, nx, nz} — normal points in race direction
    this.totalLaps = TOTAL_LAPS;
    this.countdownTimer = COUNTDOWN_DURATION;
    this.countdownValue = 3; // 3, 2, 1, 0(GO), -1(done)

    this.racers = racers.map(r => {
      // Initial signed distance from finish line (should be positive — behind the line)
      const prevSide = this._signedDist(r.kart.position.x, r.kart.position.z);
      return {
        kart: r.kart,
        isPlayer: r.isPlayer || false,
        nextCheckpoint: 0,
        lap: 1,
        cpThisLap: 0, // checkpoints hit since last line crossing
        checkpointsPassed: 0, // total, for position sorting
        wrongWay: false,
        finished: false,
        position: 1,
        prevSide, // signed distance to finish line last frame
      };
    });
  }

  /** Signed distance from finish line. Positive = behind (start side), negative = past it. */
  _signedDist(x, z) {
    if (!this.finishLine) return 1;
    const fl = this.finishLine;
    return (x - fl.x) * fl.nx + (z - fl.z) * fl.nz;
  }

  isFrozen() {
    return this.countdownValue > 0;
  }

  update(dt) {
    // Countdown
    if (this.countdownTimer > 0) {
      this.countdownTimer -= dt;
      if (this.countdownTimer > 3) this.countdownValue = 3;
      else if (this.countdownTimer > 2) this.countdownValue = 2;
      else if (this.countdownTimer > 1) this.countdownValue = 1;
      else if (this.countdownTimer > 0) this.countdownValue = 0; // GO
      else this.countdownValue = -1; // countdown done
    } else {
      this.countdownValue = -1;
    }

    if (this.isFrozen()) return;
    if (this.checkpoints.length < 2) return;

    const cpCount = this.checkpoints.length;
    const minCPs = Math.floor(cpCount * MIN_CP_FRACTION);

    for (const r of this.racers) {
      if (r.finished) continue;

      // --- Checkpoint advancement (lookahead) ---
      let bestAdvance = -1;
      for (let look = 0; look < CP_LOOKAHEAD; look++) {
        const cpIdx = (r.nextCheckpoint + look) % cpCount;
        const cp = this.checkpoints[cpIdx];
        const dx = cp.x - r.kart.position.x;
        const dz = cp.z - r.kart.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < CP_HIT_RADIUS) {
          bestAdvance = look;
        }
      }

      if (bestAdvance >= 0) {
        const steps = bestAdvance + 1;
        r.nextCheckpoint = (r.nextCheckpoint + steps) % cpCount;
        r.checkpointsPassed += steps;
        r.cpThisLap += steps;
      }

      // --- Finish line crossing ---
      if (this.finishLine) {
        const curSide = this._signedDist(r.kart.position.x, r.kart.position.z);
        // Lateral distance: project onto line direction (perpendicular to normal)
        const fl = this.finishLine;
        const latDist = (r.kart.position.x - fl.x) * (-fl.nz) + (r.kart.position.z - fl.z) * fl.nx;
        const withinLine = Math.abs(latDist) <= FINISH_LINE_WIDTH / 2;
        // Crossed from negative to positive = completed a lap (approaching from behind after looping)
        if (r.prevSide < 0 && curSide >= 0 && r.cpThisLap >= minCPs && withinLine) {
          r.cpThisLap = 0;
          r.nextCheckpoint = 0;
          r.lap++;
          if (r.lap > this.totalLaps) {
            r.finished = true;
            r.lap = this.totalLaps;
          }
        }
        r.prevSide = curSide;
      }

      // --- Wrong-way detection ---
      const nextCP = this.checkpoints[r.nextCheckpoint];
      const toCPx = nextCP.x - r.kart.position.x;
      const toCPz = nextCP.z - r.kart.position.z;
      const toCPdist = Math.sqrt(toCPx * toCPx + toCPz * toCPz);
      if (toCPdist > 1) {
        const fwdX = -Math.sin(r.kart.rotation.y);
        const fwdZ = -Math.cos(r.kart.rotation.y);
        const dot = (fwdX * toCPx + fwdZ * toCPz) / toCPdist;
        r.wrongWay = dot < -0.3;
      } else {
        r.wrongWay = false;
      }
    }

    this._updatePositions();
  }

  _updatePositions() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.lap !== b.lap) return b.lap - a.lap;
      if (a.checkpointsPassed !== b.checkpointsPassed) return b.checkpointsPassed - a.checkpointsPassed;
      const cpA = this.checkpoints[a.nextCheckpoint];
      const cpB = this.checkpoints[b.nextCheckpoint];
      const distA = Math.hypot(cpA.x - a.kart.position.x, cpA.z - a.kart.position.z);
      const distB = Math.hypot(cpB.x - b.kart.position.x, cpB.z - b.kart.position.z);
      return distA - distB;
    });

    for (let i = 0; i < sorted.length; i++) {
      sorted[i].position = i + 1;
    }
  }

  getPlayerState() {
    return this.racers.find(r => r.isPlayer);
  }
}
