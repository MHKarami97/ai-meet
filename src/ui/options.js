import "./theme.js";
import { settingsStore } from "../background/settings-store.js";
import { PROMPT_TEMPLATES } from "../ai/prompt-templates.js";
import { PROVIDER_TYPES } from "../ai/providers.js";

const PROVIDER_TYPE_LABELS = {
  [PROVIDER_TYPES.GEMINI]: "Gemini (مستقیم)",
  [PROVIDER_TYPES.CLOUDFLARE_GEMINI]: "Gemini از طریق Cloudflare AI Gateway",
  [PROVIDER_TYPES.OPENAI_COMPATIBLE]: "OpenAI یا سرور هم‌سازگار (Ollama و...)",
  [PROVIDER_TYPES.MANUAL]: "بدون کلید (کپی دستی در چت هوش مصنوعی)",
};

class OptionsApp {
  constructor() {
    this.settings = null;
  }

  async init() {
    this.settings = await settingsStore.getAll();
    this.renderTheme();
    this.renderProviders();
    this.renderTemplateSelect();
    this.renderCustomTemplates();
    this.renderLanguage();
    this.renderExportSettings();
    this.renderGithub();

    document
      .getElementById("addProviderBtn")
      .addEventListener("click", () => this.addProvider());
    document
      .getElementById("addTemplateBtn")
      .addEventListener("click", () => this.addCustomTemplate());
    document
      .getElementById("saveBtn")
      .addEventListener("click", () => this.save());
  }

  renderTheme() {
    const theme = this.settings.theme === "light" ? "light" : "dark";
    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
      radio.checked = radio.value === theme;
      radio.addEventListener("change", () => {
        this.settings.theme = radio.value;
        document.documentElement.setAttribute(
          "data-theme",
          radio.value === "light" ? "light" : "dark",
        );
      });
    });
  }

  renderExportSettings() {
    const checkbox = document.getElementById("includeFullTranscript");
    checkbox.checked = !!this.settings.includeFullTranscript;
    checkbox.addEventListener("change", () => {
      this.settings.includeFullTranscript = checkbox.checked;
    });
  }

  addProvider() {
    this.settings.providers.push({
      id: crypto.randomUUID(),
      type: PROVIDER_TYPES.GEMINI,
      name: "Provider جدید",
      apiKey: "",
      baseUrl: "",
      model: "",
      accountId: "",
      gatewayId: "",
    });
    this.renderProviders();
  }

  renderProviders() {
    const root = document.getElementById("providerList");
    root.innerHTML = "";
    this.settings.providers.forEach((p, index) => {
      const card = document.createElement("div");
      card.className = "provider-card";
      const isManual = p.type === PROVIDER_TYPES.MANUAL;
      const isCloudflare = p.type === PROVIDER_TYPES.CLOUDFLARE_GEMINI;

      card.innerHTML = `
        <div class="row-inline">
          <input type="text" data-field="name" value="${this.esc(p.name)}" placeholder="نام Provider">
          <select data-field="type">
            ${Object.entries(PROVIDER_TYPE_LABELS)
              .map(
                ([val, label]) =>
                  `<option value="${val}" ${p.type === val ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
          <label><input type="radio" name="activeProvider" data-field="active" ${this.settings.activeProviderId === p.id ? "checked" : ""}> فعال</label>
          <button class="remove-btn" data-action="remove">حذف</button>
        </div>
        ${
          isManual
            ? '<p class="manual-note">این Provider هیچ کلیدی لازم ندارد. هنگام ساخت گزارش، افزونه یک متن آماده برای کپی به شما می‌دهد تا در هر چت هوش مصنوعی (ChatGPT، Gemini، Claude و...) بچسبانید و پاسخ را برگردانید.</p>'
            : `
        <div class="row-inline" style="margin-top:8px">
          <input type="text" data-field="apiKey" value="${this.esc(p.apiKey || "")}" placeholder="API Key">
          <input type="text" data-field="model" value="${this.esc(p.model || "")}" placeholder="model (مثلاً gemini-2.5-flash)">
        </div>
        ${p.type === PROVIDER_TYPES.OPENAI_COMPATIBLE ? `<div class="row-inline" style="margin-top:8px"><input type="text" data-field="baseUrl" value="${this.esc(p.baseUrl || "")}" placeholder="Base URL (پیش‌فرض https://api.openai.com/v1)"></div>` : ""}
        ${
          isCloudflare
            ? `<div class="row-inline" style="margin-top:8px">
          <input type="text" data-field="accountId" value="${this.esc(p.accountId || "")}" placeholder="Cloudflare Account ID">
          <input type="text" data-field="gatewayId" value="${this.esc(p.gatewayId || "")}" placeholder="AI Gateway ID">
        </div>`
            : ""
        }`
        }
      `;

      card.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () =>
          this.onProviderFieldChange(index, input),
        );
        input.addEventListener("change", () =>
          this.onProviderFieldChange(index, input),
        );
      });
      card
        .querySelector('[data-action="remove"]')
        .addEventListener("click", () => {
          this.settings.providers.splice(index, 1);
          this.renderProviders();
        });

      root.appendChild(card);
    });
  }

  onProviderFieldChange(index, input) {
    const field = input.dataset.field;
    const provider = this.settings.providers[index];
    if (field === "active") {
      this.settings.activeProviderId = provider.id;
      return;
    }
    provider[field] = input.value;
    if (field === "type") this.renderProviders();
  }

  renderTemplateSelect() {
    const select = document.getElementById("defaultTemplateSelect");
    const allTemplates = [
      ...PROMPT_TEMPLATES,
      ...this.settings.customTemplates,
    ];
    select.innerHTML = allTemplates
      .map(
        (t) =>
          `<option value="${t.id}" ${this.settings.defaultTemplateId === t.id ? "selected" : ""}>${this.esc(t.name)}</option>`,
      )
      .join("");
    select.addEventListener("change", () => {
      this.settings.defaultTemplateId = select.value;
    });
  }

  addCustomTemplate() {
    this.settings.customTemplates.push({
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name: "قالب اختصاصی جدید",
      description: "",
      systemInstruction:
        "دستورالعمل مدل را اینجا بنویسید. توجه: بخش الزامی خروجی JSON به‌صورت خودکار به انتهای این متن افزوده می‌شود.",
    });
    this.renderCustomTemplates();
    this.renderTemplateSelect();
  }

  renderCustomTemplates() {
    const root = document.getElementById("templateList");
    root.innerHTML = "";
    this.settings.customTemplates.forEach((t, index) => {
      const card = document.createElement("div");
      card.className = "template-card";
      card.innerHTML = `
        <div class="row-inline">
          <input type="text" data-field="name" value="${this.esc(t.name)}" placeholder="نام قالب">
          <button class="remove-btn" data-action="remove">حذف</button>
        </div>
        <textarea data-field="systemInstruction" rows="4" style="width:100%;margin-top:8px">${this.esc(t.systemInstruction)}</textarea>
      `;
      card.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          this.settings.customTemplates[index][input.dataset.field] =
            input.value;
        });
      });
      card
        .querySelector('[data-action="remove"]')
        .addEventListener("click", () => {
          this.settings.customTemplates.splice(index, 1);
          this.renderCustomTemplates();
          this.renderTemplateSelect();
        });
      root.appendChild(card);
    });
  }

  renderLanguage() {
    document.querySelectorAll('input[name="languageMode"]').forEach((radio) => {
      radio.checked = radio.value === this.settings.languageMode;
      radio.addEventListener("change", () => {
        this.settings.languageMode = radio.value;
      });
    });
    const select = document.getElementById("defaultLanguageSelect");
    select.value = this.settings.defaultLanguage;
    select.addEventListener("change", () => {
      this.settings.defaultLanguage = select.value;
    });
  }

  renderGithub() {
    document.getElementById("githubEnabled").checked =
      !!this.settings.github.enabled;
    document.getElementById("githubToken").value =
      this.settings.github.token || "";
    document.getElementById("githubOwner").value =
      this.settings.github.owner || "";
    document.getElementById("githubRepo").value =
      this.settings.github.repo || "";
    document.getElementById("githubBranch").value =
      this.settings.github.branch || "main";
    document.getElementById("githubPathPrefix").value =
      this.settings.github.pathPrefix || "meetings";
  }

  collectGithub() {
    return {
      enabled: document.getElementById("githubEnabled").checked,
      token: document.getElementById("githubToken").value.trim(),
      owner: document.getElementById("githubOwner").value.trim(),
      repo: document.getElementById("githubRepo").value.trim(),
      branch: document.getElementById("githubBranch").value.trim() || "main",
      pathPrefix:
        document.getElementById("githubPathPrefix").value.trim() || "meetings",
    };
  }

  async save() {
    this.settings.github = this.collectGithub();
    await settingsStore.update(this.settings);
    const status = document.getElementById("saveStatus");
    status.textContent = "✔ ذخیره شد";
    setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }

  esc(str) {
    return String(str).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  }
}

const app = new OptionsApp();
app.init();
