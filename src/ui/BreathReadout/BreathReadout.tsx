import { useTranslation } from 'react-i18next';
import styles from './BreathReadout.module.css';

/** Typographic placeholder, not translatable copy (F3). */
const PLACEHOLDER = '—';

interface BreathReadoutProps {
  /**
   * True until the breath source has locked once, ever. Survives Clear
   * (design §7.5) — Clear must not send the player back to "blow to detect"
   * when detection is still live.
   */
  detecting: boolean;
  /** null before detection, or right after Clear before a new sample arrives. */
  value: number | null;
}

const MIDI_MAX = 127;

export function BreathReadout({ detecting, value }: BreathReadoutProps) {
  const { t } = useTranslation();

  if (detecting) {
    return (
      <div className={styles.readout}>
        <span className={styles.detecting}>{t('breath.detecting')}</span>
      </div>
    );
  }

  return (
    <div className={styles.readout}>
      <div className={styles.value} data-testid="breath-value">
        {value ?? PLACEHOLDER}
      </div>
      <div className={styles.max}>{t('breath.outOf', { max: MIDI_MAX })}</div>
    </div>
  );
}
