import { settingsStore } from '../background/settings-store.js';

/**
 * Applies the persisted theme (dark default, or light) to the current
 * document as early as possible, and keeps it in sync live if the user
 * changes it from the options page while this page stays open.
 */
export async function applyTheme() {
  const settings = await settingsStore.getAll();
  setThemeAttribute(settings.theme);
  settingsStore.onThemeChange((theme) => setThemeAttribute(theme));
}

function setThemeAttribute(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

// Side-effect: importing this module (from sidepanel.js or options.js) applies
// the theme immediately, so callers only need `import './theme.js';`.
applyTheme();
