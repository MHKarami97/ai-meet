var DICTIONARY_PATHS = Object.freeze({
  fa: 'src/i18n/fa.json',
  en: 'src/i18n/en.json',
});

var DEFAULT_LANGUAGE = 'fa';
var dictionaryCache = {};

async function loadDictionary(lang) {
  if (dictionaryCache[lang]) return dictionaryCache[lang];
  var path = DICTIONARY_PATHS[lang] || DICTIONARY_PATHS[DEFAULT_LANGUAGE];
  var res = await fetch(chrome.runtime.getURL(path));
  var json = await res.json();
  dictionaryCache[lang] = json;
  return json;
}

export class I18n {
  constructor() {
    this.lang = DEFAULT_LANGUAGE;
    this.dictionary = {};
  }

  /**
   * Loads the dictionary for `lang` (falls back to Persian for any
   * unrecognized value) and updates <html lang>/<html dir> so RTL/LTR
   * layout follows the chosen language automatically.
   * @param {string} lang 'fa' | 'en'
   */
  async setLanguage(lang) {
    this.lang = DICTIONARY_PATHS[lang] ? lang : DEFAULT_LANGUAGE;
    this.dictionary = await loadDictionary(this.lang);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', this.lang);
      document.documentElement.setAttribute('dir', this.lang === 'fa' ? 'rtl' : 'ltr');
    }
  }

  /**
   * Translates a key. Falls back to the key itself if missing, so a
   * missing translation is visibly obvious instead of silently blank.
   * Supports `{name}` placeholders via the optional `vars` map.
   * @param {string} key
   * @param {Object<string,string|number>} [vars]
   * @returns {string}
   */
  t(key, vars) {
    var template = this.dictionary[key] || key;
    if (!vars) return template;
    return Object.keys(vars).reduce(function (acc, name) {
      return acc.split('{' + name + '}').join(String(vars[name]));
    }, template);
  }

  /**
   * Walks the DOM under `root` (defaults to the whole document) and
   * applies translations declared via:
   *   data-i18n="key"              -> el.textContent
   *   data-i18n-placeholder="key"  -> el.placeholder
   *   data-i18n-title="key"        -> el.title
   * @param {ParentNode} [root]
   */
  translateDom(root) {
    var scope = root || document;
    var self = this;

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = self.t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', self.t(el.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', self.t(el.getAttribute('data-i18n-title')));
    });
  }
}

export var i18n = new I18n();
