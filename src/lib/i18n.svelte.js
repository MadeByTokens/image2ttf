/**
 * Internationalization (i18n) module for image2ttf.
 *
 * Provides reactive locale state, a translation function with interpolation,
 * browser language detection, and localStorage persistence.
 */

import { en } from './i18n/en.js';
import { ptBR } from './i18n/pt-BR.js';
import { es } from './i18n/es.js';
import { fr } from './i18n/fr.js';

/** All available locales: id, label (native name), translations */
export const LOCALES = [
  { id: 'en', label: 'English', translations: en },
  { id: 'pt-BR', label: 'Portugues (Brasil)', translations: ptBR },
  { id: 'es', label: 'Espanol', translations: es },
  { id: 'fr', label: 'Francais', translations: fr },
];

const LOCALE_MAP = Object.fromEntries(LOCALES.map(l => [l.id, l]));
const STORAGE_KEY = 'locale';
const PROMPT_DISMISSED_KEY = 'locale_prompt_dismissed';

function loadSavedLocale() {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) || '';
}

/** Reactive i18n state */
export const i18n = $state({
  locale: loadSavedLocale() || 'en',
  /** Whether the user has explicitly chosen a locale (or dismissed the prompt) */
  promptDismissed: typeof localStorage !== 'undefined'
    ? localStorage.getItem(PROMPT_DISMISSED_KEY) === '1'
    : true,
});

/**
 * Set the active locale and persist it.
 * @param {string} localeId - e.g. 'en', 'pt-BR', 'es', 'fr'
 */
export function setLocale(localeId) {
  if (!LOCALE_MAP[localeId]) return;
  i18n.locale = localeId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, localeId);
  }
}

/** Mark the language prompt as dismissed so it won't show again. */
export function dismissLanguagePrompt() {
  i18n.promptDismissed = true;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  }
}

/**
 * Detect the best matching locale from the browser's language settings.
 * Returns the locale id (e.g. 'pt-BR', 'es') or null if no match other than 'en'.
 */
export function detectBrowserLocale() {
  if (typeof navigator === 'undefined') return null;
  const langs = navigator.languages || [navigator.language];
  for (const lang of langs) {
    // Exact match first (e.g. 'pt-BR')
    if (LOCALE_MAP[lang]) return lang;
    // Base language match (e.g. 'pt' -> 'pt-BR', 'es-MX' -> 'es')
    const base = lang.split('-')[0];
    const match = LOCALES.find(l => l.id.split('-')[0] === base);
    if (match) return match.id;
  }
  return null;
}

/**
 * Translate a key with optional interpolation.
 *
 * @param {string} key - Dot-separated path, e.g. 'upload.title'
 * @param {Record<string, string|number>} [params] - Interpolation values, e.g. { count: 5 }
 * @returns {string} The translated string, or the key itself if not found.
 *
 * Interpolation syntax: {varName} in the translation string.
 * Example: t('detect.status', { rows: 3, cells: 66 }) -> "Detected 3 rows, 66 cells"
 */
export function t(key, params) {
  const locale = LOCALE_MAP[i18n.locale] || LOCALE_MAP['en'];
  let value = resolve(locale.translations, key);

  // Fall back to English if key is missing in current locale
  if (value === undefined && locale !== LOCALE_MAP['en']) {
    value = resolve(LOCALE_MAP['en'].translations, key);
  }

  if (value === undefined) return key;

  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{${k}}`
    );
  }
  return value;
}

/** Resolve a dot-separated key path in a nested object. */
function resolve(obj, key) {
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}
