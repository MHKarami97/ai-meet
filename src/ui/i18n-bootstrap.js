import { i18n } from '../i18n/i18n.js';
import { settingsStore } from '../background/settings-store.js';

/**
 * @param {ParentNode} [root] optional subtree to translate; defaults to
 *   the whole document (use a subtree when re-translating a piece of UI
 *   that was just re-rendered dynamically, e.g. after innerHTML swap).
 * @returns {Promise<void>}
 */
export async function applyI18n(root) {
  var settings = await settingsStore.getAll();
  await i18n.setLanguage(settings.uiLanguage || 'fa');
  i18n.translateDom(root);
}

/**
 * Registers a live listener so that if the user changes the language from
 * the options page while a side panel (or another options tab) stays open,
 * that page re-translates itself immediately without a manual reload.
 * @param {() => void} [onAfterTranslate] optional callback to re-render any
 *   JS-built dynamic text (tabs, badges, tone labels, etc.) after the
 *   dictionary swap.
 */
export function watchLanguageChanges(onAfterTranslate) {
  settingsStore.onLanguageChange(async function (newLang) {
    await i18n.setLanguage(newLang);
    i18n.translateDom(document);
    if (typeof onAfterTranslate === 'function') onAfterTranslate();
  });
}
