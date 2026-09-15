import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sw from './locales/sw.json';

// Scoped to the POS screen only (client/src/pages/POSPage.jsx) — that's where
// cashiers spend all day. Every other page stays hardcoded English by design.
const STORAGE_KEY = 'posLocale';

const savedLocale = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'en';
  } catch {
    return 'en';
  }
})();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sw: { translation: sw },
  },
  lng: savedLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Manual persistence, matching the pattern AuthContext.jsx already uses for
// token/user instead of pulling in i18next-browser-language-detector.
export const setPosLocale = (locale) => {
  i18n.changeLanguage(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage unavailable — locale just won't persist across reloads
  }
};

export default i18n;
