import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

i18n.use(initReactI18next).init({
  resources,
  fallbackLng: 'en',
  supportedLngs: ['en', 'fr'],
  interpolation: {
    escapeValue: false, // React escapes by default.
  },
});

export default i18n;
