import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { browserEnvironment, type MidiEnvironment } from '../core/midi/access';
import { createEmeoConnection, type ConnectionState } from '../core/midi/connection';
import { BreathRing } from '../core/model/ringBuffer';
import { attachConsoleLogger, isDebugEnabled } from '../debug/consoleLogger';
import { startSynthetic } from '../dev/syntheticEmeo';
import { Header } from './Header/Header';
import { History } from './History/History';
import { BreathReadout } from './BreathReadout/BreathReadout';
import { applyNoteOff, applyNoteOn, closeAllOpenNotes } from './noteTracker';
import { Stage } from './Stage/Stage';
import type { NoteBlock } from './Stage/geometry';
import styles from './App.module.css';

declare global {
  interface Window {
    /**
     * Debug-only escape hatch (behind ?debug, design §8): re-runs breath
     * source detection without a page reload — e.g. if the detector locked
     * onto the wrong control because the player nudged another controller
     * before blowing.
     */
    __emeoResetBreathDetection?: () => void;
  }
}

interface AppProps {
  environment?: MidiEnvironment;
  synthetic?: boolean;
}

/** ~15s window at ~200 breath messages/sec, with headroom. */
const RING_CAPACITY = 8000;
const READOUT_HZ = 12;
/** Notes older than this are pruned. Well beyond the ~15s visible window. */
const NOTE_HISTORY_MS = 60_000;
/** Hard cap on the notes array — a backstop that should never trigger (F1). */
const MAX_NOTES = 2000;

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
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [breath, setBreath] = useState<number | null>(null);
  // True once the breath source has ever locked. Distinct from `breath`
  // being non-null: "never detected" and "just cleared" are different
  // states (F3), and Clear must not reset this — re-detecting would force
  // the player to blow again for nothing (design §7.5).
  const [detected, setDetected] = useState(false);
  // Bumped on Clear so Stage/History can force one repaint even while
  // paused (F2, design §7.5).
  const [contentToken, setContentToken] = useState(0);

  useEffect(() => connection.onStateChange(setState), [connection]);

  useEffect(() => {
    if (!isDebugEnabled(window.location.search)) return;
    const detachLogger = attachConsoleLogger(connection.events, connection.detector);
    // F5: design §8 promises resetBreathDetection() for debugging, but
    // BreathDetector.reset() had no non-test caller. Expose it strictly
    // behind the debug flag so a developer whose detector locked onto the
    // wrong control does not have to reload mid hardware-session.
    window.__emeoResetBreathDetection = () => connection.detector.reset();
    console.info(
      '[emeo] window.__emeoResetBreathDetection() is available to re-run breath source detection.',
    );
    return () => {
      detachLogger();
      delete window.__emeoResetBreathDetection;
    };
  }, [connection]);

  useEffect(() => {
    let lastReadout = 0;
    let hasDetected = false;
    return connection.events.subscribe((event) => {
      if (event.kind === 'breath') {
        ring.push(event.t, event.value);
        // Breath events are published only once the detector has locked, so
        // the first one is a sound, one-time detection signal (F3). A plain
        // closure flag (not React state) guards this so it fires setState
        // at most once instead of on every sample.
        if (!hasDetected) {
          hasDetected = true;
          setDetected(true);
        }
        // Throttled: a numeral changing 200 times a second cannot be read, and
        // one setState per sample would re-render React at MIDI rate.
        if (event.t - lastReadout >= 1000 / READOUT_HZ) {
          lastReadout = event.t;
          // F4: the readout freezes with the picture while paused (§7.5).
          // The ring buffer above still receives every sample regardless.
          if (!pausedRef.current) setBreath(event.value);
        }
        return;
      }
      if (event.kind === 'note-on') {
        applyNoteOn(notes, event.note, event.t, NOTE_HISTORY_MS, MAX_NOTES);
        return;
      }
      if (event.kind === 'note-off') {
        applyNoteOff(notes, event.note, event.t);
      }
    });
  }, [connection, ring, notes]);

  // F1c: once the connection is no longer `connected` (lost, idle, or
  // anything else), it can no longer be trusted to deliver a matching
  // note-off for whatever is currently sounding — e.g. the cable is
  // unplugged mid-note (FR-17). Close every still-open note so it isn't
  // orphaned and doesn't block pruning forever. This stays in App, not
  // connection.ts: the core must not learn about note bookkeeping.
  useEffect(() => {
    if (state.status === 'connected') return;
    closeAllOpenNotes(notes, performance.now());
  }, [state.status, notes]);

  useEffect(() => {
    if (!synthetic || state.status !== 'connected') return;
    return startSynthetic(env);
  }, [synthetic, state.status, env]);

  const clear = () => {
    ring.clear();
    notes.length = 0; // In place: Stage and History hold this exact array.
    setBreath(null);
    // Breath detection deliberately survives Clear (design §7.5) — re-detecting
    // would make the player blow again for nothing. `detected` is untouched.
    setContentToken((token) => token + 1); // F2: force one repaint while paused.
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
        <BreathReadout detecting={!detected} value={breath} />
        <Stage ring={ring} notes={notes} paused={paused} contentToken={contentToken} />
        <History notes={notes} paused={paused} contentToken={contentToken} />
      </div>
    </div>
  );
}
