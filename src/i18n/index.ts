import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

const SUPPORTED = ['en', 'fr'] as const;
const FALLBACK = 'en' as const;

/**
 * Resolves the preferred language to a supported one.
 * Detects French in any regional form (case-insensitive);
 * anything else defaults to English.
 *
 * Hand-rolled detection to avoid i18next-browser-languagedetector,
 * which persists language choice to localStorage (forbidden in this project).
 */
export function resolveLanguage(
  preferred: readonly string[] | string | undefined,
): (typeof SUPPORTED)[number] {
  if (!preferred || (Array.isArray(preferred) && preferred.length === 0)) {
    return FALLBACK;
  }

  const candidates = Array.isArray(preferred) ? preferred : [preferred];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const normalized = candidate.toLowerCase();
    if (normalized.startsWith('fr')) return 'fr';
  }

  return FALLBACK;
}

const detectedLng = resolveLanguage(
  typeof navigator !== 'undefined'
    ? navigator.languages ?? navigator.language
    : undefined,
);

i18n.use(initReactI18next).init({
  lng: detectedLng,
  resources,
  fallbackLng: FALLBACK,
  supportedLngs: SUPPORTED,
  interpolation: {
    escapeValue: false, // React escapes by default.
  },
});

export default i18n;
