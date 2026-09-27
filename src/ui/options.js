import "./theme.js";
import { settingsStore } from "../background/settings-store.js";
import { PROMPT_TEMPLATES } from "../ai/prompt-templates.js";
import { PROVIDER_TYPES } from "../ai/providers.js";

const PROVIDER_TYPE_LABELS = {
  [PROVIDER_TYPES.GEMINI]: "Gemini",
  [PROVIDER_TYPES.OPENAI_COMPATIBLE]: "OpenAI یا سرور هم‌سازگار (Ollama و...)",
  [PROVIDER_TYPES.CLOUDFLARE_GEMINI]: "Gemini از طریق Cloudflare",
  [PROVIDER_TYPES.MANUAL]: "کپی دستی در هوش مصنوعی",
};

const SYNC_LABELS = {
  github: {
    baseUrl:
      "آدرس پایه (فقط برای GitLab/Azure DevOps داخلی سازمان - خالی بگذارید یعنی نسخه‌ی عمومی)",
    token: "Personal Access Token",
    owner: "صاحب مخزن (owner)",
    repo: "نام مخزن",
    hint: "توکن باید دسترسی Contents: Read and write روی مخزن مقصد داشته باشد (Fine-grained PAT پیشنهاد می‌شود).",
  },
  gitlab: {
    baseUrl:
      "آدرس نمونه‌ی GitLab (خالی = gitlab.com؛ برای نسخه‌ی داخلی سازمان آدرس آن را بگذارید)",
    token: "Personal/Project Access Token (با دسترسی api یا write_repository)",
    owner: "گروه/فضای نام (namespace)",
    repo: "مسیر پروژه (مثلاً group/project یا فقط project اگر owner را هم پر کرده‌اید)",
    hint: "اگر GitLab داخلی سازمان دارید، آدرس کامل آن را در «آدرس پایه» وارد کنید؛ برای gitlab.com این فیلد را خالی بگذارید.",
  },
  "azure-devops": {
    baseUrl: "آدرس Collection برای سرور داخلی/TFS (خالی = dev.azure.com ابری)",
    token: "Personal Access Token",
    owner: "نام سازمان (Organization) - فقط اگر آدرس پایه خالی است",
    repo: "نام مخزن (Repository)",
    hint: "برای Azure DevOps سرور داخلی سازمان، آدرس Collection را در «آدرس پایه» بگذارید (مثلاً https://tfs.mycompany.com/tfs/DefaultCollection). فیلد «پروژه» هم برای Azure DevOps الزامی است.",
  },
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
    this.renderSync();

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
          <input type="password" data-field="apiKey" value="${this.esc(p.apiKey || "")}" placeholder="${isCloudflare ? "Cloudflare API Token (نه کلید Gemini)" : "API Key"}">
          <input type="text" data-field="model" value="${this.esc(p.model || "")}" placeholder="${isCloudflare ? "model (مثلاً google/gemini-2.5-flash)" : "model (مثلاً gemini-2.5-flash)"}">
        </div>
        ${p.type === PROVIDER_TYPES.OPENAI_COMPATIBLE ? `<div class="row-inline" style="margin-top:8px"><input type="text" data-field="baseUrl" value="${this.esc(p.baseUrl || "")}" placeholder="Base URL (پیش‌فرض https://api.openai.com/v1)"></div>` : ""}
        ${
          isCloudflare
            ? `<div class="row-inline" style="margin-top:8px">
          <input type="text" data-field="accountId" value="${this.esc(p.accountId || "")}" placeholder="Cloudflare Account ID">
          <input type="text" data-field="gatewayId" value="${this.esc(p.gatewayId || "")}" placeholder="Gateway ID (اختیاری، پیش‌فرض default)">
        </div>
        <p class="manual-note">این مسیر از اندپوینت یکپارچه‌ی جدید Cloudflare (<code>/ai/run</code>) استفاده می‌کند: به یک Gemini API key نیازی نیست؛ فقط یک <b>Cloudflare API Token</b> با دسترسی <b>Account &gt; Workers AI &gt; Read</b> کافی است.</p>`
            : ""
        }`
        }
      `;

      card
        .querySelectorAll(
          'input[type="text"][data-field], textarea[data-field]',
        )
        .forEach((input) => {
          input.addEventListener("input", () =>
            this.onProviderFieldChange(index, input),
          );
        });
      card
        .querySelectorAll('input[type="radio"][data-field]')
        .forEach((radio) => {
          radio.addEventListener("change", () =>
            this.onProviderFieldChange(index, radio),
          );
        });
      card.querySelectorAll("select[data-field]").forEach((select) => {
        select.addEventListener("change", () => {
          const provider = this.settings.providers[index];
          provider[select.dataset.field] = select.value;
          setTimeout(() => this.renderProviders(), 0);
        });
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

    const hideCaptionsCheckbox = document.getElementById("hideCaptionsUi");
    hideCaptionsCheckbox.checked = !!this.settings.hideCaptionsUi;
    hideCaptionsCheckbox.addEventListener("change", () => {
      this.settings.hideCaptionsUi = hideCaptionsCheckbox.checked;
    });
  }

  renderSync() {
    const sync = this.settings.sync;
    document.getElementById("syncEnabled").checked = !!sync.enabled;
    document.getElementById("syncProvider").value = sync.provider || "github";
    document.getElementById("syncBaseUrl").value = sync.baseUrl || "";
    document.getElementById("syncToken").value = sync.token || "";
    document.getElementById("syncOwner").value = sync.owner || "";
    document.getElementById("syncProject").value = sync.project || "";
    document.getElementById("syncRepo").value = sync.repo || "";
    document.getElementById("syncBranch").value = sync.branch || "main";
    document.getElementById("syncPathPrefix").value =
      sync.pathPrefix || "meetings";

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

  /** Swaps field labels/placeholders and shows the "پروژه" row only for Azure DevOps. */
  applySyncLabels(provider) {
    const labels = SYNC_LABELS[provider] || SYNC_LABELS.github;
    document.getElementById("syncBaseUrlLabel").textContent = labels.baseUrl;
    document.getElementById("syncTokenLabel").textContent = labels.token;
    document.getElementById("syncOwnerLabel").textContent = labels.owner;
    document.getElementById("syncRepoLabel").textContent = labels.repo;
    document.getElementById("syncHint").textContent = labels.hint;
    document.getElementById("syncProjectRow").style.display =
      provider === "azure-devops" ? "flex" : "none";
  }

  async save() {
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
