import { useTranslation } from 'react-i18next';
import type { ConnectionState } from '../../core/midi/connection';
import { connectionMessageKey } from '../connectionMessage';
import styles from './Header.module.css';

interface HeaderProps {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  onChoosePort: (id: string) => void;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
}

export function Header({
  state, onConnect, onDisconnect, onChoosePort, paused, onTogglePause, onClear,
}: HeaderProps) {
  const { t } = useTranslation();

  const name = 'port' in state ? state.port.name : '';
  const isProblem = state.status === 'unsupported' || state.status === 'error';

  return (
    <header className={styles.header}>
      <span className={styles.title}>{t('app.title')}</span>

      <span className={isProblem ? styles.statusError : styles.status}>
        {t(connectionMessageKey(state), { name })}
      </span>

      {state.status === 'choosing' && (
        <span className={styles.ports}>
          {state.ports.map((port) => (
            <button key={port.id} className={styles.button} onClick={() => onChoosePort(port.id)}>
              {port.name}
            </button>
          ))}
        </span>
      )}

      <span className={styles.spacer} />

      {state.status === 'connected' && (
        <button className={styles.button} onClick={onDisconnect}>
          {t('connection.disconnect')}
        </button>
      )}
      {state.status === 'lost' && (
        <button className={styles.button} onClick={onConnect}>
          {t('connection.reconnect')}
        </button>
      )}
      {(state.status === 'idle' || state.status === 'error') && (
        <button className={styles.button} onClick={onConnect}>
          {t('connection.connect')}
        </button>
      )}

      <button className={styles.button} onClick={onTogglePause}>
        {paused ? t('controls.resume') : t('controls.pause')}
      </button>
      <button className={styles.button} onClick={onClear}>
        {t('controls.clear')}
      </button>
    </header>
  );
}
