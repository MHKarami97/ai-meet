/**
 * Centralized settings persistence (chrome.storage.local).
 * A single "settings" object is stored so reads/writes stay atomic and simple.
 */
const DEFAULTS = {
  theme: "dark",
  providers: [
    {
      id: "manual-default",
      type: "manual",
      name: "بدون کلید (کپی دستی)",
      apiKey: "",
      baseUrl: "",
      model: "",
    },
  ],
  activeProviderId: "manual-default",
  defaultTemplateId: "general-technical",
  languageMode: "auto",
  defaultLanguage: "fa",
  includeFullTranscript: false,
  hideCaptionsUi: false,
  sync: {
    enabled: false,
    provider: "github", // 'github' | 'gitlab' | 'azure-devops'
    baseUrl: "", // self-hosted GitLab or on-prem Azure DevOps Server URL; empty = public SaaS
    token: "",
    owner: "", // GitHub owner / GitLab namespace-or-group / Azure DevOps organization
    repo: "", // GitHub repo / GitLab project path (e.g. "group/project") / Azure DevOps repository name
    project: "", // Azure DevOps project name only (GitHub/GitLab ignore this)
    branch: "main",
    pathPrefix: "meetings",
  },
  customTemplates: [],
};

export class SettingsStore {
  async getAll() {
    const stored = await chrome.storage.local.get("settings");
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
    return (
      settings.providers.find((p) => p.id === settings.activeProviderId) ||
      settings.providers[0] ||
      null
    );
  }

  /** Registers a live callback that fires whenever the theme changes in storage (e.g. from the options page). */
  onThemeChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const newTheme = changes.settings.newValue?.theme;
      const oldTheme = changes.settings.oldValue?.theme;
      if (newTheme && newTheme !== oldTheme) callback(newTheme);
    });
  }
}

export const settingsStore = new SettingsStore();
