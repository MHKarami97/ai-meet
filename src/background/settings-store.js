import { encryptJson, decryptJson } from './crypto-helper.js';

var LOCAL_STORAGE_KEY = 'settings';
var SECRETS_STORAGE_KEY = 'settingsSecretsEncrypted';

var DEFAULTS = Object.freeze({
  theme: 'dark',
  uiLanguage: 'fa', // 'fa' | 'en' — in-app UI language, user-switchable from Options
  providers: [
    {
      id: 'manual-default',
      type: 'manual',
      name: 'manual',
      baseUrl: '',
      model: '',
    },
  ],
  activeProviderId: 'manual-default',
  defaultTemplateId: 'general-technical',
  languageMode: 'auto',
  defaultLanguage: 'fa',
  includeFullTranscript: false,
  hideCaptionsUi: false,
  sync: {
    enabled: false,
    provider: 'github', // github | gitlab | azure-devops
    baseUrl: '', // self-hosted GitLab / on-prem Azure DevOps Server URL, empty = public SaaS
    owner: '', // GitHub owner / GitLab namespace-or-group / Azure DevOps organization
    repo: '', // GitHub repo / GitLab "group/project" path / Azure DevOps repository name
    project: '', // Azure DevOps project name only, GitHub/GitLab ignore this
    branch: 'main',
    pathPrefix: 'meetings/',
  },
  customTemplates: [],
});

var DEFAULT_SECRETS = Object.freeze({ providerSecrets: {}, syncToken: '' });

/**
 * Provider-level fields that must be AES-GCM encrypted before touching
 * chrome.storage.local.
 */
var SECRET_PROVIDER_FIELDS = Object.freeze(['apiKey', 'accountId', 'gatewayId']);

/**
 * Facade over chrome.storage.local so every caller (background worker,
 * options page, side panel) keeps a single atomic read/write API, with the
 * encrypt/decrypt split of secret fields handled transparently inside.
 */
export class SettingsStore {
  /**
   * Reads the full, merged settings object: non-secret fields read as-is,
   * secret fields decrypted and re-attached to their provider entries.
   * @returns {Promise<object>}
   */
  async getAll() {
    var stored = await chrome.storage.local.get([LOCAL_STORAGE_KEY, SECRETS_STORAGE_KEY]);
    var nonSecret = deepMerge(DEFAULTS, stored[LOCAL_STORAGE_KEY] || {});
    var secrets = await decryptJson(stored[SECRETS_STORAGE_KEY], DEFAULT_SECRETS);

    var providers = nonSecret.providers.map(function (provider) {
      var providerSecrets = secrets.providerSecrets[provider.id] || {};
      return Object.assign({}, provider, providerSecrets);
    });

    return Object.assign({}, nonSecret, {
      providers: providers,
      sync: Object.assign({}, nonSecret.sync, { token: secrets.syncToken || '' }),
    });
  }

  /**
   * Persists a partial settings patch. Secret fields (provider
   * apiKey/accountId/gatewayId, sync.token) are AES-GCM encrypted before
   * being written; everything else (including uiLanguage) is written as
   * plain JSON.
   * @param {object} partial
   * @returns {Promise<object>} the merged settings object after the write
   */
  async update(partial) {
    var current = await this.getAll();
    var next = deepMerge(current, partial);

    var secretsPayload = { providerSecrets: {}, syncToken: next.sync.token || '' };

    var localProviders = next.providers.map(function (provider) {
      var nonSecretPart = {};
      var secretPart = {};
      Object.keys(provider).forEach(function (key) {
        if (SECRET_PROVIDER_FIELDS.indexOf(key) !== -1) {
          secretPart[key] = provider[key];
        } else {
          nonSecretPart[key] = provider[key];
        }
      });
      secretsPayload.providerSecrets[provider.id] = secretPart;
      return nonSecretPart;
    });

    var syncWithoutToken = Object.assign({}, next.sync);
    delete syncWithoutToken.token;

    var localPayload = Object.assign({}, next, {
      providers: localProviders,
      sync: syncWithoutToken,
    });

    var encryptedSecrets = await encryptJson(secretsPayload);

    await chrome.storage.local.set(wrap(LOCAL_STORAGE_KEY, localPayload));
    await chrome.storage.local.set(wrap(SECRETS_STORAGE_KEY, encryptedSecrets));

    return next;
  }

  async getActiveProvider() {
    var settings = await this.getAll();
    var active = settings.providers.find(function (p) {
      return p.id === settings.activeProviderId;
    });
    return active || settings.providers[0] || null;
  }

  /**
   * Registers a live callback that fires whenever the theme changes in
   * storage (e.g. from the options page while a side panel stays open).
   */
  onThemeChange(callback) {
    this._onFieldChange('theme', callback);
  }

  /**
   * Registers a live callback that fires whenever the in-app UI language
   * changes in storage (e.g. saved from the options page while a side
   * panel stays open elsewhere).
   * @param {(lang: string) => void} callback
   */
  onLanguageChange(callback) {
    this._onFieldChange('uiLanguage', callback);
  }

  _onFieldChange(field, callback) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[LOCAL_STORAGE_KEY]) return;
      var newValue = changes[LOCAL_STORAGE_KEY].newValue && changes[LOCAL_STORAGE_KEY].newValue[field];
      var oldValue = changes[LOCAL_STORAGE_KEY].oldValue && changes[LOCAL_STORAGE_KEY].oldValue[field];
      if (newValue && newValue !== oldValue) callback(newValue);
    });
  }
}

function wrap(key, value) {
  var obj = {};
  obj[key] = value;
  return obj;
}

/** Shallow-safe merge, good enough for this flat settings shape. */
function deepMerge(base, patch) {
  var result = Object.assign({}, base, patch);
  if (patch && patch.sync) result.sync = Object.assign({}, base.sync, patch.sync);
  if (patch && patch.providers) result.providers = patch.providers;
  return result;
}

export var settingsStore = new SettingsStore();