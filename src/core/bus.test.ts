import { EventBus, type Unsubscribe } from './bus';

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

  it('unsubscribing one of two identical function references leaves the other subscribed', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const fn = (n: number) => seen.push(n);
    bus.subscribe(fn);
    const offSecond = bus.subscribe(fn);
    offSecond();
    bus.publish(1);
    // The same fn was subscribed twice; removing one subscription must leave
    // exactly one delivery per publish, not zero.
    expect(seen).toEqual([1]);
    bus.publish(2);
    expect(seen).toEqual([1, 2]);
  });

  it('lets other subscribers finish when one unsubscribes itself mid-publish', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    let off: Unsubscribe;
    off = bus.subscribe((n) => {
      seen.push(-n);
      off();
    });
    bus.subscribe((n) => seen.push(n));
    bus.publish(1);
    expect(seen).toEqual([-1, 1]);
    bus.publish(2);
    // The self-unsubscribed callback must not run again; the other one still does.
    expect(seen).toEqual([-1, 1, 2]);
  });

  it('still delivers the in-flight event to a subscriber unsubscribed by another during the same publish', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    let offB: Unsubscribe;
    bus.subscribe(() => {
      offB();
    });
    offB = bus.subscribe((n) => seen.push(n));
    bus.publish(1);
    // The snapshot was fixed before A ran, so B still receives the in-flight event.
    expect(seen).toEqual([1]);
    bus.publish(2);
    // But B is unsubscribed for every publish after that.
    expect(seen).toEqual([1]);
  });
});
