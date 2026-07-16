import { EventBus, type Unsubscribe } from '../bus';
import type { EmeoEvent } from '../model/events';
import { checkMidiSupport, type MidiEnvironment } from './access';
import { BreathDetector } from './breathSource';
import { parseMidi } from './decode';
import type { MidiAccessLike, MidiInputLike, MidiMessageEventLike } from './types';

export interface PortInfo {
  id: string;
  name: string;
}

export interface EmeoError {
  code: 'no-ports' | 'permission-denied' | 'unknown';
  detail?: string;
}

export type ConnectionState =
  | { status: 'unsupported'; reason: 'no-web-midi' | 'insecure-context' }
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'choosing'; ports: PortInfo[] }
  | { status: 'connected'; port: PortInfo }
  | { status: 'lost'; port: PortInfo }
  | { status: 'error'; error: EmeoError };

export interface EmeoConnection {
  readonly state: ConnectionState;
  onStateChange(fn: (state: ConnectionState) => void): Unsubscribe;
  readonly events: EventBus<EmeoEvent>;
  readonly detector: BreathDetector;
  connect(): Promise<void>;
  choosePort(id: string): void;
  disconnect(): void;
}

const UNKNOWN_DEVICE = 'Unknown device';

export function createEmeoConnection(env: MidiEnvironment): EmeoConnection {
  const events = new EventBus<EmeoEvent>();
  const stateBus = new EventBus<ConnectionState>();
  const detector = new BreathDetector();

  let state: ConnectionState = { status: 'idle' };
  let access: MidiAccessLike | null = null;
  let attached: MidiInputLike | null = null;
  let connecting = false;

  function setState(next: ConnectionState): void {
    state = next;
    stateBus.publish(next);
  }

  function info(input: MidiInputLike): PortInfo {
    return { id: input.id, name: input.name ?? UNKNOWN_DEVICE };
  }

  // Web MIDI keeps ports in access.inputs after they are unplugged, marked
  // 'disconnected'. Only ports still actually present may ever be attached to.
  function connectedInputs(a: MidiAccessLike): MidiInputLike[] {
    return [...a.inputs.values()].filter((input) => input.state === 'connected');
  }

  function handle(event: MidiMessageEventLike): void {
    // timeStamp, never Date.now(): if the tab hitches, events queue, and
    // stamping on arrival would draw a breath shape that never happened.
    const t = event.timeStamp;
    events.publish({ kind: 'raw', data: event.data, t });

    const msg = parseMidi(event.data, t);
    if (msg.type === 'note-on') {
      events.publish({ kind: 'note-on', note: msg.note, velocity: msg.velocity, t });
      return;
    }
    if (msg.type === 'note-off') {
      events.publish({ kind: 'note-off', note: msg.note, t });
      return;
    }

    detector.observe(msg);
    const breath = detector.breathValueOf(msg);
    if (breath !== null) {
      events.publish({ kind: 'breath', source: breath.source, value: breath.value, t });
    }
  }

  function detach(): void {
    if (attached) attached.onmidimessage = null;
    attached = null;
  }

  function attach(input: MidiInputLike): void {
    detach();
    attached = input;
    input.onmidimessage = handle;
    setState({ status: 'connected', port: info(input) });
  }

  async function connect(): Promise<void> {
    // Guards against a double-click on Connect: the second call while one is
    // already in flight returns immediately without touching state, rather
    // than racing the first call's continuation and regressing an already
    // established 'connected' state back to 'choosing'.
    if (connecting) return;
    connecting = true;
    try {
      const support = checkMidiSupport(env);
      if (!support.ok) {
        setState({ status: 'unsupported', reason: support.reason });
        return;
      }

      setState({ status: 'requesting' });
      try {
        access = await env.requestMIDIAccess!();
      } catch (error) {
        const denied = error instanceof DOMException && error.name === 'SecurityError';
        setState({
          status: 'error',
          error: {
            code: denied ? 'permission-denied' : 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          },
        });
        return;
      }

      access.onstatechange = (event) => {
        if (event.port.state === 'disconnected' && event.port.id === attached?.id) {
          const port = info(event.port);
          detach();
          setState({ status: 'lost', port });
        }
      };

      const inputs = connectedInputs(access);
      if (inputs.length === 0) {
        setState({ status: 'error', error: { code: 'no-ports' } });
        return;
      }
      if (inputs.length === 1) {
        attach(inputs[0]);
        return;
      }
      setState({ status: 'choosing', ports: inputs.map(info) });
    } finally {
      connecting = false;
    }
  }

  function choosePort(id: string): void {
    const input = access?.inputs.get(id);
    if (input && input.state === 'connected') {
      attach(input);
      return;
    }
    // The requested port is gone or was never there (stale UI, race with an
    // unplug): re-derive what's actually still connected rather than leaving
    // the caller stranded in 'choosing' with no signal.
    const remaining = access ? connectedInputs(access) : [];
    if (remaining.length > 0) {
      setState({ status: 'choosing', ports: remaining.map(info) });
    } else {
      setState({ status: 'error', error: { code: 'no-ports' } });
    }
  }

  function disconnect(): void {
    detach();
    // Only disconnect() clears this, not detach(): attach() also calls
    // detach() defensively before attaching, and detach() runs right after
    // connect() installs this handler, so clearing it there would immediately
    // un-wire disconnect detection for the port we just attached to.
    if (access) access.onstatechange = null;
    setState({ status: 'idle' });
  }

  return {
    get state() {
      return state;
    },
    onStateChange: (fn) => stateBus.subscribe(fn),
    events,
    detector,
    connect,
    choosePort,
    disconnect,
  };
}
