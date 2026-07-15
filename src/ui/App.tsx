import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { browserEnvironment, type MidiEnvironment } from '../core/midi/access';
import { createEmeoConnection, type ConnectionState } from '../core/midi/connection';
import { BreathRing } from '../core/model/ringBuffer';
import { attachConsoleLogger, isDebugEnabled } from '../debug/consoleLogger';
import { startSynthetic } from '../dev/syntheticEmeo';
import { Header } from './Header/Header';
import { History } from './History/History';
import { BreathReadout } from './BreathReadout/BreathReadout';
import { Stage } from './Stage/Stage';
import type { NoteBlock } from './Stage/geometry';
import styles from './App.module.css';

interface AppProps {
  environment?: MidiEnvironment;
  synthetic?: boolean;
}

/** ~15s window at ~200 breath messages/sec, with headroom. */
const RING_CAPACITY = 8000;
const READOUT_HZ = 12;
/** Notes older than this are pruned. Well beyond the ~15s visible window. */
const NOTE_HISTORY_MS = 60_000;

export function App({ environment, synthetic = false }: AppProps) {
  const { t } = useTranslation();
  const env = useMemo(() => environment ?? browserEnvironment(), [environment]);
  const connection = useMemo(() => createEmeoConnection(env), [env]);

  // Written at MIDI rate, read at frame rate, never in React state.
  // `notes` is a STABLE array, mutated in place and never replaced: App does not
  // re-render on note events, so a new array identity would never reach Stage.
  const ring = useMemo(() => new BreathRing(RING_CAPACITY), []);
  const notes = useMemo<NoteBlock[]>(() => [], []);

  const [state, setState] = useState<ConnectionState>(connection.state);
  const [paused, setPaused] = useState(false);
  const [breath, setBreath] = useState<number | null>(null);

  useEffect(() => connection.onStateChange(setState), [connection]);

  useEffect(() => {
    if (!isDebugEnabled(window.location.search)) return;
    return attachConsoleLogger(connection.events, connection.detector);
  }, [connection]);

  useEffect(() => {
    let lastReadout = 0;
    return connection.events.subscribe((event) => {
      if (event.kind === 'breath') {
        ring.push(event.t, event.value);
        // Throttled: a numeral changing 200 times a second cannot be read, and
        // one setState per sample would re-render React at MIDI rate.
        if (event.t - lastReadout >= 1000 / READOUT_HZ) {
          lastReadout = event.t;
          setBreath(event.value);
        }
        return;
      }
      if (event.kind === 'note-on') {
        notes.push({ note: event.note, start: event.t, end: null });
        // Prune in place — splice, never reassign.
        const cutoff = event.t - NOTE_HISTORY_MS;
        while (notes.length > 0 && (notes[0].end ?? Infinity) < cutoff) notes.shift();
        return;
      }
      if (event.kind === 'note-off') {
        const open = notes.findLast((n) => n.note === event.note && n.end === null);
        if (open) open.end = event.t;
      }
    });
  }, [connection, ring, notes]);

  useEffect(() => {
    if (!synthetic || state.status !== 'connected') return;
    return startSynthetic(env);
  }, [synthetic, state.status, env]);

  const clear = () => {
    ring.clear();
    notes.length = 0; // In place: Stage and History hold this exact array.
    setBreath(null);
    // Breath detection deliberately survives Clear (design §7.5) — re-detecting
    // would make the player blow again for nothing.
  };

  return (
    <div className={styles.app}>
      <Header
        state={state}
        onConnect={() => void connection.connect()}
        onDisconnect={() => connection.disconnect()}
        onChoosePort={(id) => connection.choosePort(id)}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onClear={clear}
      />

      {state.status === 'idle' && <p className={styles.hint}>{t('connection.hint')}</p>}

      <div className={styles.body}>
        <BreathReadout value={breath} />
        <Stage ring={ring} notes={notes} paused={paused} />
        <History notes={notes} paused={paused} />
      </div>
    </div>
  );
}
