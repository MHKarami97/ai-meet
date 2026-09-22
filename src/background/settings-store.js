/**
 * Centralized settings persistence (chrome.storage.local).
 * A single "settings" object is stored so reads/writes stay atomic and simple.
 */
const DEFAULTS = {
  providers: [
    { id: 'manual-default', type: 'manual', name: 'بدون کلید (کپی دستی)', apiKey: '', baseUrl: '', model: '' }
  ],
  activeProviderId: 'manual-default',
  defaultTemplateId: 'general-technical',
  languageMode: 'auto',
  defaultLanguage: 'fa',
  github: {
    enabled: false,
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    pathPrefix: 'meetings'
  },
  customTemplates: []
};

export class SettingsStore {
  async getAll() {
    const stored = await chrome.storage.local.get('settings');
    return { ...DEFAULTS, ...(stored.settings || {}) };
  }

  async update(partial) {
    const current = await this.getAll();
    const next = { ...current, ...partial };
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  async getActiveProvider() {
    const settings = await this.getAll();
    return settings.providers.find((p) => p.id === settings.activeProviderId) || settings.providers[0] || null;
  }
}

export const settingsStore = new SettingsStore();
