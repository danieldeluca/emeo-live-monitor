import { useTranslation } from 'react-i18next';
import styles from './BreathReadout.module.css';

interface BreathReadoutProps {
  /** null until the breath source is detected. */
  value: number | null;
}

const MIDI_MAX = 127;

export function BreathReadout({ value }: BreathReadoutProps) {
  const { t } = useTranslation();

  if (value === null) {
    return (
      <div className={styles.readout}>
        <span className={styles.detecting}>{t('breath.detecting')}</span>
      </div>
    );
  }

  return (
    <div className={styles.readout}>
      <div className={styles.value}>{value}</div>
      <div className={styles.max}>{t('breath.outOf', { max: MIDI_MAX })}</div>
    </div>
  );
}
