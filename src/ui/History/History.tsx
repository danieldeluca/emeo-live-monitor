import { useEffect, useMemo, useRef, useState } from 'react';
import { pitchName } from '../../core/model/pitch';
import type { NoteBlock } from '../Stage/geometry';
import { DEFAULT_GEOMETRY, nowLineY } from '../Stage/timeToY';
import { keepSpaced } from './collide';
import styles from './History.module.css';

interface HistoryProps {
  /** Stable array owned by App and mutated in place. Same contract as Stage. */
  notes: NoteBlock[];
  paused: boolean;
}

const MIN_SPACING_PX = 26;

export function History({ notes, paused }: HistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Bumped only when a note is added or pruned — a few times a second, never
  // at frame rate. Label motion is handled by the transform below, not by React.
  const [revision, setRevision] = useState(0);
  const rows = useMemo(
    () => keepSpaced(notes, MIN_SPACING_PX, DEFAULT_GEOMETRY.pxPerMs),
    // `notes` is mutated in place, so its identity never changes; `revision`
    // is what signals a real change instead. The rAF loop below bumps it
    // whenever `notes.length` OR the newest note's `start` differs from the
    // previous tick — length alone goes silent once the 60s history window
    // is full, because each new note-on prunes roughly one old note and
    // length stops moving, even though the visible set keeps changing. It is
    // intentionally a dependency even though it is otherwise unused in the
    // body.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [notes, revision],
  );

  useEffect(() => {
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    let frame = 0;
    let lastCount = -1;
    let lastStart: number | undefined;

    const tick = () => {
      frame = requestAnimationFrame(tick);

      // Length alone is not a sound change-signal: once the history window is
      // full, an append and a prune happen together and length stays put. The
      // newest note's `start` still moves on every append (notes arrive in
      // strictly increasing timestamp order), so checking both catches every
      // real change while staying O(1) — no array walk, no signature string.
      const newestStart = notes[notes.length - 1]?.start;
      if (notes.length !== lastCount || newestStart !== lastStart) {
        lastCount = notes.length;
        lastStart = newestStart;
        setRevision((r) => r + 1);
      }

      // Pause freezes the display, not the instrument.
      if (pausedRef.current) return;

      const height = container.getBoundingClientRect().height;
      const line = nowLineY({ height, ...DEFAULT_GEOMETRY });
      // One transform carries every row: y = line + (now - start) * pxPerMs,
      // with the per-row half (-start * pxPerMs) baked into offsetPx.
      const y = line + performance.now() * DEFAULT_GEOMETRY.pxPerMs;
      scroller.style.transform = `translateY(${y}px)`;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [notes]);

  return (
    <div ref={containerRef} className={styles.history}>
      <div ref={scrollerRef} className={styles.scroller}>
        {rows.map((row, index) => {
          const name = pitchName(row.note);
          return (
            <div
              key={`${row.note}-${row.start}`}
              className={index === 0 ? `${styles.row} ${styles.current}` : styles.row}
              style={{ transform: `translateY(${row.offsetPx}px)` }}
            >
              <div className={styles.en} data-testid="history-en">
                {name.en}
                {name.octave}
              </div>
              <div className={styles.eu} data-testid="history-eu">
                {name.eu}
                {name.octave}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
