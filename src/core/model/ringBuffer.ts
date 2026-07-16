/**
 * Fixed-capacity store of breath samples.
 * Preallocated typed arrays: `push` never allocates, so no GC pauses mid-phrase.
 */
export class BreathRing {
  private readonly times: Float64Array;
  private readonly values: Float32Array;
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.times = new Float64Array(capacity);
    this.values = new Float32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  get latest(): { t: number; value: number } | null {
    if (this.count === 0) return null;
    const i = (this.head - 1 + this.capacity) % this.capacity;
    return { t: this.times[i], value: this.values[i] };
  }

  push(t: number, value: number): void {
    this.times[this.head] = t;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  forEachSince(tMin: number, fn: (t: number, value: number) => void): void {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let n = 0; n < this.count; n++) {
      const i = (start + n) % this.capacity;
      if (this.times[i] >= tMin) fn(this.times[i], this.values[i]);
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
