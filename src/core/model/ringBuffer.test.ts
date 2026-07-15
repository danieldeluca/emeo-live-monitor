import { BreathRing } from './ringBuffer';

function collect(ring: BreathRing, tMin = -Infinity) {
  const out: Array<[number, number]> = [];
  ring.forEachSince(tMin, (t, v) => out.push([t, v]));
  return out;
}

describe('BreathRing', () => {
  it('starts empty', () => {
    const ring = new BreathRing(4);
    expect(ring.size).toBe(0);
    expect(ring.latest).toBeNull();
    expect(collect(ring)).toEqual([]);
  });

  it('iterates samples oldest first', () => {
    const ring = new BreathRing(4);
    ring.push(1, 10);
    ring.push(2, 20);
    expect(collect(ring)).toEqual([[1, 10], [2, 20]]);
    expect(ring.size).toBe(2);
  });

  it('overwrites the oldest sample once capacity is exceeded', () => {
    const ring = new BreathRing(3);
    for (let i = 1; i <= 5; i++) ring.push(i, i * 10);
    expect(collect(ring)).toEqual([[3, 30], [4, 40], [5, 50]]);
    expect(ring.size).toBe(3);
  });

  it('filters by minimum timestamp', () => {
    const ring = new BreathRing(4);
    for (let i = 1; i <= 4; i++) ring.push(i, i * 10);
    expect(collect(ring, 3)).toEqual([[3, 30], [4, 40]]);
  });

  it('reports the most recent sample', () => {
    const ring = new BreathRing(3);
    ring.push(1, 10);
    ring.push(2, 99);
    expect(ring.latest).toEqual({ t: 2, value: 99 });
  });

  it('clears', () => {
    const ring = new BreathRing(3);
    ring.push(1, 10);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.latest).toBeNull();
    expect(collect(ring)).toEqual([]);
  });
});
