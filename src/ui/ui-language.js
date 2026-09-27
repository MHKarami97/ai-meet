import { i18n } from '../i18n/i18n.js';
import { settingsStore } from '../background/settings-store.js';

/**
 * @param {(lang: string) => void} [onChange] called after the dictionary
 *   has been swapped and static data-i18n markup has been re-translated —
 *   use it to re-render any JS-built dynamic text.
 * @returns {Promise<void>}
 */
export async function applyUiLanguage(onChange) {
  var settings = await settingsStore.getAll();
  await i18n.setLanguage(settings.uiLanguage || 'fa');
  i18n.translateDom(document);

  settingsStore.onLanguageChange(async function (lang) {
    await i18n.setLanguage(lang);
    i18n.translateDom(document);
    if (typeof onChange === 'function') onChange(lang);
  });
}