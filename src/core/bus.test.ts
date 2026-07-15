import { EventBus } from './bus';

describe('EventBus', () => {
  it('delivers to every subscriber', () => {
    const bus = new EventBus<number>();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((n) => a.push(n));
    bus.subscribe((n) => b.push(n));
    bus.publish(1);
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const off = bus.subscribe((n) => seen.push(n));
    bus.publish(1);
    off();
    bus.publish(2);
    expect(seen).toEqual([1]);
  });

  it('does not throw when publishing with no subscribers', () => {
    const bus = new EventBus<number>();
    expect(() => bus.publish(1)).not.toThrow();
  });

  it('does not deliver the in-flight event to a subscriber added during publish', () => {
    const bus = new EventBus<number>();
    const late: number[] = [];
    bus.subscribe(() => {
      bus.subscribe((n) => late.push(n));
    });
    bus.publish(1);
    expect(late).toEqual([]);
    bus.publish(2);
    expect(late).toEqual([2]);
  });

  it('keeps delivering to remaining subscribers when one throws', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((n) => seen.push(n));
    expect(() => bus.publish(1)).not.toThrow();
    expect(seen).toEqual([1]);
  });
});
