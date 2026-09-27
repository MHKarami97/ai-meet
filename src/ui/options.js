import "./theme.js";
import { applyUiLanguage } from "./ui-language.js";
import { i18n } from "../i18n/i18n.js";
import { settingsStore } from "../background/settings-store.js";
import { PROMPT_TEMPLATES } from "../ai/prompt-templates.js";
import { PROVIDER_TYPES } from "../ai/providers.js";

function providerTypeLabel(type) {
  var key = {
    [PROVIDER_TYPES.GEMINI]: "provider_type_gemini",
    [PROVIDER_TYPES.OPENAI_COMPATIBLE]: "provider_type_openai_compatible",
    [PROVIDER_TYPES.CLOUDFLARE_GEMINI]: "provider_type_cloudflare_gemini",
    [PROVIDER_TYPES.MANUAL]: "provider_type_manual",
  }[type];
  return key ? i18n.t(key) : type;
}

function providerTypeLabels() {
  var labels = {};
  Object.values(PROVIDER_TYPES).forEach(function (type) {
    labels[type] = providerTypeLabel(type);
  });
  return labels;
}

function syncLabels(provider) {
  var prefix = provider === "gitlab" ? "sync_gitlab_" : provider === "azure-devops" ? "sync_azure_" : "sync_github_";
  return {
    baseUrl: i18n.t(prefix + "baseurl"),
    token: i18n.t(prefix + "token"),
    owner: i18n.t(prefix + "owner"),
    repo: i18n.t(prefix + "repo"),
    hint: i18n.t(prefix + "hint"),
  };
}

class OptionsApp {
  constructor() {
    this.settings = null;
  }

  async init() {
    this.settings = await settingsStore.getAll();
    await applyUiLanguage(() => this.rerenderAll());

    this.renderTheme();
    this.renderUiLanguage();
    this.renderProviders();
    this.renderTemplateSelect();
    this.renderCustomTemplates();
    this.renderLanguage();
    this.renderExportSettings();
    this.renderSync();

    document.getElementById("addProviderBtn").addEventListener("click", () => this.addProvider());
    document.getElementById("addTemplateBtn").addEventListener("click", () => this.addCustomTemplate());
    document.getElementById("saveBtn").addEventListener("click", () => this.save());
  }

  /** Re-renders every dynamic, JS-built piece of text after a live language change. */
  rerenderAll() {
    this.renderProviders();
    this.renderTemplateSelect();
    this.renderCustomTemplates();
    this.renderSync();
  }

  renderTheme() {
    var theme = this.settings.theme === "light" ? "light" : "dark";
    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
      radio.checked = radio.value === theme;
      radio.addEventListener("change", () => {
        this.settings.theme = radio.value;
        document.documentElement.setAttribute("data-theme", radio.value === "light" ? "light" : "dark");
      });
    });
  }

  /**
   * In-app UI language selector (independent of the browser's language and
   * of the caption/transcript `defaultLanguage` handled by renderLanguage()).
   */
  renderUiLanguage() {
    var select = document.getElementById("uiLanguageSelect");
    if (!select) return; // see the HTML snippet you need to add — documented separately
    select.value = this.settings.uiLanguage || "fa";
    select.addEventListener("change", async () => {
      this.settings.uiLanguage = select.value;
      await settingsStore.update({ uiLanguage: select.value });
      await i18n.setLanguage(select.value);
      i18n.translateDom(document);
      this.rerenderAll();
    });
  }

  renderExportSettings() {
    var checkbox = document.getElementById("includeFullTranscript");
    checkbox.checked = !!this.settings.includeFullTranscript;
    checkbox.addEventListener("change", () => {
      this.settings.includeFullTranscript = checkbox.checked;
    });
  }

  addProvider() {
    this.settings.providers.push({
      id: crypto.randomUUID(),
      type: PROVIDER_TYPES.GEMINI,
      name: i18n.t("provider_new_name"),
      apiKey: "",
      baseUrl: "",
      model: "",
      accountId: "",
      gatewayId: "",
    });
    this.renderProviders();
  }

  renderProviders() {
    var root = document.getElementById("providerList");
    root.innerHTML = "";
    var labels = providerTypeLabels();

    this.settings.providers.forEach((p, index) => {
      var card = document.createElement("div");
      card.className = "provider-card";
      var isManual = p.type === PROVIDER_TYPES.MANUAL;
      var isCloudflare = p.type === PROVIDER_TYPES.CLOUDFLARE_GEMINI;

      card.innerHTML = `
        <div class="row-inline">
          <input type="text" data-field="name" value="${this.esc(p.name)}" placeholder="${this.esc(i18n.t("provider_new_name"))}">
          <select data-field="type">
            ${Object.entries(labels)
              .map(([val, label]) => `<option value="${val}" ${p.type === val ? "selected" : ""}>${this.esc(label)}</option>`)
              .join("")}
          </select>
          <label><input type="radio" name="activeProvider" data-field="active" ${this.settings.activeProviderId === p.id ? "checked" : ""}></label>
          <button class="remove-btn" data-action="remove">${this.esc(i18n.t("provider_remove"))}</button>
        </div>
        ${
          isManual
            ? `<p class="manual-note">${this.esc(i18n.t("provider_manual_note"))}</p>`
            : `
        <div class="row-inline" style="margin-top:8px">
          <input type="password" data-field="apiKey" value="${this.esc(p.apiKey)}" placeholder="${this.esc(isCloudflare ? i18n.t("provider_apikey_placeholder_cloudflare") : i18n.t("provider_apikey_placeholder_default"))}">
          <input type="text" data-field="model" value="${this.esc(p.model)}" placeholder="${this.esc(isCloudflare ? i18n.t("provider_model_placeholder_cloudflare") : i18n.t("provider_model_placeholder_default"))}">
        </div>
        ${
          p.type === PROVIDER_TYPES.OPENAI_COMPATIBLE
            ? `<div class="row-inline" style="margin-top:8px"><input type="text" data-field="baseUrl" value="${this.esc(p.baseUrl)}" placeholder="${this.esc(i18n.t("provider_baseurl_placeholder"))}"></div>`
            : ""
        }
        ${
          isCloudflare
            ? `
          <div class="row-inline" style="margin-top:8px">
            <input type="text" data-field="accountId" value="${this.esc(p.accountId)}" placeholder="${this.esc(i18n.t("provider_accountid_placeholder"))}">
            <input type="text" data-field="gatewayId" value="${this.esc(p.gatewayId)}" placeholder="${this.esc(i18n.t("provider_gatewayid_placeholder"))}">
          </div>
          <p class="manual-note">${this.esc(i18n.t("provider_cloudflare_note"))}</p>`
            : ""
        }`
        }
      `;

      card.querySelectorAll('input[type="text"][data-field], input[type="password"][data-field], textarea[data-field]').forEach((input) => {
        input.addEventListener("input", () => this.onProviderFieldChange(index, input));
      });
      card.querySelectorAll('input[type="radio"][data-field]').forEach((radio) => {
        radio.addEventListener("change", () => this.onProviderFieldChange(index, radio));
      });
      card.querySelectorAll("select[data-field]").forEach((select) => {
        select.addEventListener("change", () => {
          var provider = this.settings.providers[index];
          provider[select.dataset.field] = select.value;
          setTimeout(() => this.renderProviders(), 0);
        });
      });
      card.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.settings.providers.splice(index, 1);
        this.renderProviders();
      });

      root.appendChild(card);
    });
  }

  onProviderFieldChange(index, input) {
    var field = input.dataset.field;
    var provider = this.settings.providers[index];
    if (field === "active") {
      this.settings.activeProviderId = provider.id;
      return;
    }
    provider[field] = input.value;
  }

  renderTemplateSelect() {
    var select = document.getElementById("defaultTemplateSelect");
    var allTemplates = [...PROMPT_TEMPLATES, ...this.settings.customTemplates];
    select.innerHTML = allTemplates
      .map((t) => `<option value="${t.id}" ${this.settings.defaultTemplateId === t.id ? "selected" : ""}>${this.esc(t.name)}</option>`)
      .join("");
    select.addEventListener("change", () => {
      this.settings.defaultTemplateId = select.value;
    });
  }

  addCustomTemplate() {
    this.settings.customTemplates.push({
      id: "custom-" + crypto.randomUUID().slice(0, 8),
      name: i18n.t("template_new_name"),
      description: "",
      systemInstruction: i18n.t("template_new_instruction"),
    });
    this.renderCustomTemplates();
    this.renderTemplateSelect();
  }

  renderCustomTemplates() {
    var root = document.getElementById("templateList");
    root.innerHTML = "";
    this.settings.customTemplates.forEach((t, index) => {
      var card = document.createElement("div");
      card.className = "template-card";
      card.innerHTML = `
        <div class="row-inline">
          <input type="text" data-field="name" value="${this.esc(t.name)}" placeholder="${this.esc(i18n.t("template_new_name"))}">
          <button class="remove-btn" data-action="remove">${this.esc(i18n.t("template_remove"))}</button>
        </div>
        <textarea data-field="systemInstruction" rows="4" style="width:100%;margin-top:8px">${this.esc(t.systemInstruction)}</textarea>
      `;
      card.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          this.settings.customTemplates[index][input.dataset.field] = input.value;
        });
      });
      card.querySelector('[data-action="remove"]').addEventListener("click", () => {
        this.settings.customTemplates.splice(index, 1);
        this.renderCustomTemplates();
        this.renderTemplateSelect();
      });
      root.appendChild(card);
    });
  }

  /** Caption/transcript language settings — unrelated to the in-app uiLanguage. */
  renderLanguage() {
    document.querySelectorAll('input[name="languageMode"]').forEach((radio) => {
      radio.checked = radio.value === this.settings.languageMode;
      radio.addEventListener("change", () => {
        this.settings.languageMode = radio.value;
      });
    });
    var select = document.getElementById("defaultLanguageSelect");
    select.value = this.settings.defaultLanguage;
    select.addEventListener("change", () => {
      this.settings.defaultLanguage = select.value;
    });
    var hideCaptionsCheckbox = document.getElementById("hideCaptionsUi");
    hideCaptionsCheckbox.checked = !!this.settings.hideCaptionsUi;
    hideCaptionsCheckbox.addEventListener("change", () => {
      this.settings.hideCaptionsUi = hideCaptionsCheckbox.checked;
    });
  }

  renderSync() {
    var sync = this.settings.sync;
    document.getElementById("syncEnabled").checked = !!sync.enabled;
    document.getElementById("syncProvider").value = sync.provider || "github";
    document.getElementById("syncBaseUrl").value = sync.baseUrl || "";
    document.getElementById("syncToken").value = sync.token || "";
    document.getElementById("syncOwner").value = sync.owner || "";
    document.getElementById("syncProject").value = sync.project || "";
    document.getElementById("syncRepo").value = sync.repo || "";
    document.getElementById("syncBranch").value = sync.branch || "main";
    document.getElementById("syncPathPrefix").value = sync.pathPrefix || "meetings/";

    document.getElementById("syncEnabled").addEventListener("change", (e) => {
      this.settings.sync.enabled = e.target.checked;
    });
    document.getElementById("syncProvider").addEventListener("change", (e) => {
      this.settings.sync.provider = e.target.value;
      this.applySyncLabels(e.target.value);
    });
    document.getElementById("syncBaseUrl").addEventListener("input", (e) => {
      this.settings.sync.baseUrl = e.target.value;
    });
    document.getElementById("syncToken").addEventListener("input", (e) => {
      this.settings.sync.token = e.target.value;
    });
    document.getElementById("syncOwner").addEventListener("input", (e) => {
      this.settings.sync.owner = e.target.value;
    });
    document.getElementById("syncProject").addEventListener("input", (e) => {
      this.settings.sync.project = e.target.value;
    });
    document.getElementById("syncRepo").addEventListener("input", (e) => {
      this.settings.sync.repo = e.target.value;
    });
    document.getElementById("syncBranch").addEventListener("input", (e) => {
      this.settings.sync.branch = e.target.value;
    });
    document.getElementById("syncPathPrefix").addEventListener("input", (e) => {
      this.settings.sync.pathPrefix = e.target.value;
    });

    this.applySyncLabels(sync.provider || "github");
  }

  /** Swaps field labels/placeholders and shows the "Project" row only for Azure DevOps. */
  applySyncLabels(provider) {
    var labels = syncLabels(provider);
    document.getElementById("syncBaseUrlLabel").textContent = labels.baseUrl;
    document.getElementById("syncTokenLabel").textContent = labels.token;
    document.getElementById("syncOwnerLabel").textContent = labels.owner;
    document.getElementById("syncRepoLabel").textContent = labels.repo;
    document.getElementById("syncHint").textContent = labels.hint;
    document.getElementById("syncProjectRow").style.display = provider === "azure-devops" ? "flex" : "none";
  }

  async save() {
    await settingsStore.update(this.settings);
    var status = document.getElementById("saveStatus");
    status.textContent = i18n.t("options_save_status");
    setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }

  esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
}

const app = new OptionsApp();
app.init();