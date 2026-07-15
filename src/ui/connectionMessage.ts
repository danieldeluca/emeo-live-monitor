import type { ParseKeys } from 'i18next';
import type { ConnectionState } from '../core/midi/connection';

/**
 * `ParseKeys` (not `string`) so a typo'd or renamed locale key is a compile
 * error here too, and so the return type lines up with `t()`'s own key
 * parameter type — see Header.tsx, which passes this straight to `t()`.
 */
type MessageKey = ParseKeys;

/** Every state gets its own plain-language explanation (FR-5). No generic failures. */
export function connectionMessageKey(state: ConnectionState): MessageKey {
  switch (state.status) {
    case 'idle':
      return 'connection.idle';
    case 'requesting':
      return 'connection.requesting';
    case 'choosing':
      return 'connection.choosing';
    case 'connected':
      return 'connection.connected';
    case 'lost':
      return 'connection.lost';
    case 'unsupported':
      return state.reason === 'insecure-context' ? 'errors.insecureContext' : 'errors.noWebMidi';
    case 'error':
      switch (state.error.code) {
        case 'no-ports':
          return 'errors.noPorts';
        case 'permission-denied':
          return 'errors.permissionDenied';
        default:
          return 'errors.unknown';
      }
  }
}
