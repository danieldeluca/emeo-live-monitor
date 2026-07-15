import type { EventBus, Unsubscribe } from '../core/bus';
import type { BreathDetector } from '../core/midi/breathSource';
import { parseMidi } from '../core/midi/decode';
import { pitchName } from '../core/model/pitch';
import type { EmeoEvent } from '../core/model/events';

/**
 * Off by default, and it must stay that way.
 *
 * Breath arrives many times per second. console.log serializes its argument and,
 * with DevTools open, retains a reference to it — defeating garbage collection.
 * Left on in this hot path it measurably costs the smooth motion of FR-16.
 */
export function isDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

export function attachConsoleLogger(
  events: EventBus<EmeoEvent>,
  detector: BreathDetector,
): Unsubscribe {
  let announced = false;

  return events.subscribe((event) => {
    if (event.kind !== 'raw') return;

    console.debug(`[emeo] ${describe(event.data, event.t)}`, event.data);

    if (!announced && detector.resolved) {
      announced = true;
      const label =
        detector.resolved.kind === 'cc' ? `CC${detector.resolved.controller}` : 'Channel Pressure';
      console.info(`[emeo] detected breath source: ${label}`);
      console.table(detector.scoreboard());
    }
  });
}

function describe(data: Uint8Array, t: number): string {
  const msg = parseMidi(data, t);
  switch (msg.type) {
    case 'note-on': {
      const n = pitchName(msg.note);
      return `Note On  ${n.en}${n.octave} vel ${msg.velocity}`;
    }
    case 'note-off': {
      const n = pitchName(msg.note);
      return `Note Off ${n.en}${n.octave}`;
    }
    case 'cc':
      return `CC${msg.controller} ${msg.value}`;
    case 'channel-pressure':
      return `Pressure ${msg.value}`;
    case 'pitch-bend':
      return `Bend ${msg.value}`;
    default:
      return `Other [${[...data].join(' ')}]`;
  }
}
