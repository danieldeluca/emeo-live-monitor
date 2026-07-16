export type Unsubscribe = () => void;

interface Subscription<T> {
  fn: (event: T) => void;
}

/**
 * In-process publish/subscribe. Producers do not know their consumers.
 *
 * Deliberately in-memory: the producer and every consumer live in the same tab,
 * so a broker or socket would add latency between a sender and a receiver that
 * share a thread. A network transport, if ever needed, becomes one more subscriber.
 */
export class EventBus<T> {
  private subscribers: Array<Subscription<T>> = [];

  subscribe(fn: (event: T) => void): Unsubscribe {
    // Each call gets its own entry object, so identity is per-subscription
    // rather than per-function. Subscribing the same fn twice therefore
    // yields two independent unsubscribers, each removing only its own entry.
    const entry: Subscription<T> = { fn };
    this.subscribers = [...this.subscribers, entry];
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== entry);
    };
  }

  publish(event: T): void {
    // Snapshot: subscribing during delivery must not affect the in-flight event,
    // and unsubscribing must not shift the array mid-iteration.
    for (const { fn } of this.subscribers) {
      try {
        fn(event);
      } catch (error) {
        // One bad subscriber must not silence the others or stall the MIDI handler.
        console.error('[bus] subscriber threw', error);
      }
    }
  }

  clear(): void {
    this.subscribers = [];
  }
}
