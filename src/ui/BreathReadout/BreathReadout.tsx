import { useTranslation } from 'react-i18next';
import styles from './BreathReadout.module.css';

/** Typographic placeholder, not translatable copy (F3). */
const PLACEHOLDER = '—';
/** The bullet marking each split row's colour swatch — a symbol, not translatable copy. */
const DOT = '●';

export interface ReadoutRow {
  /** `Breath (CC2)` style, already localised via controllerLabel(t, id). */
  label: string;
  /** A `--color-*` design token, e.g. `--color-expression` (design §15.2). */
  colorVar: string;
  value: number;
}

/**
 * The breath readout's content, computed by App at throttle rate (design
 * §15.1). `single` is today's collapsed look; `split` appears only while a
 * divergence is visible somewhere in the graph's scrolling window.
 */
export type Readout =
  | { kind: 'single'; value: number | null }
  | { kind: 'split'; rows: ReadoutRow[] };

interface BreathReadoutProps {
  /**
   * True until the breath source has locked once, ever. Survives Clear
   * (design §7.5) — Clear must not send the player back to "blow to detect"
   * when detection is still live.
   */
  detecting: boolean;
  readout: Readout;
}

const MIDI_MAX = 127;

export function BreathReadout({ detecting, readout }: BreathReadoutProps) {
  const { t } = useTranslation();

  if (detecting) {
    return (
      <div className={styles.readout}>
        <span className={styles.detecting}>{t('breath.detecting')}</span>
      </div>
    );
  }

  if (readout.kind === 'split') {
    return (
      <div className={styles.readout}>
        <ul className={styles.splitList}>
          {readout.rows.map((row) => (
            <li
              key={row.colorVar}
              className={styles.splitRow}
              style={{ color: `var(${row.colorVar})` }}
            >
              <span className={styles.dot} aria-hidden="true">
                {DOT}
              </span>
              <span className={styles.splitLabel}>{row.label}</span>
              <span className={styles.splitValue} data-testid="breath-split-value">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.readout}>
      <div className={styles.value} data-testid="breath-value">
        {readout.value ?? PLACEHOLDER}
      </div>
      <div className={styles.max}>{t('breath.outOf', { max: MIDI_MAX })}</div>
    </div>
  );
}
