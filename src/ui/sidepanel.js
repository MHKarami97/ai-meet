import "./theme.js";
import { formatTime, Meeting } from "../db/models.js";
import { exporters } from "../export/exporters.js";
import { PROMPT_TEMPLATES } from "../ai/prompt-templates.js";
import { settingsStore } from "../background/settings-store.js";
import { PROVIDER_TYPES } from "../ai/providers.js";

function toMeeting(raw) {
  return raw ? new Meeting(raw) : null;
}

const TONE_LABELS = {
  formal: "رسمی",
  informal: "غیررسمی",
  critical: "انتقادی",
};
const SECTION_TYPE_LABELS = {
  presentation: "ارائه",
  discussion: "بحث آزاد",
  "task-assignment": "تخصیص تسک",
  "status-report": "گزارش وضعیت",
};

class SidePanelApp {
  constructor() {
    this.meetings = [];
    this.selectedId = null;
    this.activeTab = "transcript";
    this.pollTimer = null;
    this.manualContext = null;
  }

  async init() {
    document
      .getElementById("openOptionsBtn")
      .addEventListener("click", () => chrome.runtime.openOptionsPage());
    document
      .getElementById("searchInput")
      .addEventListener("input", (e) => this.loadMeetings(e.target.value));
    document
      .getElementById("closeManualModal")
      .addEventListener("click", () => this.closeManualModal());
    document
      .getElementById("copyPromptBtn")
      .addEventListener("click", () => this.copyManualPrompt());
    document
      .getElementById("processManualBtn")
      .addEventListener("click", () => this.processManualResult());

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "meeting:activated" && message.payload?.meetingId) {
        this.selectMeeting(message.payload.meetingId);
      }
    });

    await this.loadMeetings();
    this.pollTimer = setInterval(() => this.refreshSelected(), 3000);
  }

  async loadMeetings(search) {
    const raw = await chrome.runtime.sendMessage({
      type: search ? "meeting:search" : "meeting:list",
      payload: { query: search },
    });
    this.meetings = (raw || []).map(toMeeting);
    this.renderList();
    if (!this.selectedId && this.meetings[0])
      this.selectMeeting(this.meetings[0].id);
  }

  async refreshSelected() {
    if (!this.selectedId) return;
    const raw = await chrome.runtime.sendMessage({
      type: "meeting:get",
      payload: { id: this.selectedId },
    });
    const meeting = toMeeting(raw);
    if (meeting && !meeting.endedAt) this.renderDetail(meeting);
  }

  renderList() {
    const list = document.getElementById("meetingList");
    list.innerHTML = "";
    for (const meeting of this.meetings) {
      const card = document.createElement("div");
      card.className = `meeting-card ${meeting.id === this.selectedId ? "active" : ""}`;
      card.innerHTML = `
        <div class="title">${this.esc(meeting.title)}</div>
        <div class="meta">${new Date(meeting.startedAt).toLocaleDateString("fa-IR")} · ${formatTime(meeting.durationMs)}</div>`;
      card.addEventListener("click", () => this.selectMeeting(meeting.id));
      list.appendChild(card);
    }
  }

  async selectMeeting(id) {
    this.selectedId = id;
    this.activeTab = "transcript";
    this.renderList();
    const raw = await chrome.runtime.sendMessage({
      type: "meeting:get",
      payload: { id },
    });
    this.renderDetail(toMeeting(raw));
  }

  async renderDetail(meeting) {
    const root = document.getElementById("meetingDetail");
    if (!meeting) {
      root.innerHTML = '<div class="empty-state">جلسه‌ای انتخاب نشده.</div>';
      return;
    }
    const settings = await settingsStore.getAll();
    const allTemplates = [...PROMPT_TEMPLATES, ...settings.customTemplates];
    const activeProvider = settings.providers.find(
      (p) => p.id === settings.activeProviderId,
    );
    const isManualProvider = activeProvider?.type === PROVIDER_TYPES.MANUAL;

    const templateOptions = allTemplates
      .map(
        (t) =>
          `<option value="${t.id}" ${meeting.report?.templateId === t.id ? "selected" : ""}>${this.esc(t.name)}</option>`,
      )
      .join("");

    root.innerHTML = `
      <div class="detail-header">
        <div>
          <h2>${this.esc(meeting.title)}</h2>
          <div class="meta">
            ${new Date(meeting.startedAt).toLocaleString("fa-IR")} · ${formatTime(meeting.durationMs)}
            ${meeting.syncedToGithub ? '<span class="badge synced">✔ GitHub</span>' : '<span class="badge">همگام‌سازی نشده</span>'}
          </div>
        </div>
      </div>
      <div class="actions-row">
        <select id="templateSelect">${templateOptions}</select>
        <div class="btn-row">
          <button class="btn btn-primary" id="generateBtn">${meeting.report ? "🔁 بازسازی گزارش" : isManualProvider ? "📋 ساخت متن برای AI" : "✨ ساخت گزارش با AI"}</button>
          <button class="btn btn-secondary" id="syncBtn">☁️ همگام‌سازی با GitHub</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary small-btn" data-export="doc">⬇ Word</button>
          <button class="btn btn-secondary small-btn" data-export="pdf">⬇ PDF</button>
          <button class="btn btn-secondary small-btn" data-export="txt">⬇ TXT</button>
          <button class="btn btn-secondary small-btn" data-export="md">⬇ Markdown</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${this.activeTab === "transcript" ? "active" : ""}" data-tab="transcript">متن کامل</button>
        <button class="tab-btn ${this.activeTab === "summary" ? "active" : ""}" data-tab="summary">خلاصه و تصمیمات</button>
        <button class="tab-btn ${this.activeTab === "actions" ? "active" : ""}" data-tab="actions">اقدامات</button>
        <button class="tab-btn ${this.activeTab === "participation" ? "active" : ""}" data-tab="participation">مشارکت</button>
        <button class="tab-btn ${this.activeTab === "analysis" ? "active" : ""}" data-tab="analysis">تحلیل پیشرفته</button>
      </div>
      <div id="tabContent"></div>
    `;

    document.getElementById("generateBtn").addEventListener("click", () => {
      const templateId = document.getElementById("templateSelect").value;
      if (isManualProvider) this.openManualModal(meeting.id, templateId);
      else this.generateReport(meeting.id, templateId);
    });
    document
      .getElementById("syncBtn")
      .addEventListener("click", () => this.syncToGithub(meeting.id));
    document.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", () =>
        exporters[btn.dataset.export].export(meeting),
      );
    });
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.activeTab === btn.dataset.tab) return;
        this.activeTab = btn.dataset.tab;
        this.renderDetail(meeting);
      });
    });

    this.renderTabContent(meeting);
  }

  /**
   * Builds the HTML for the active tab, swaps it in, then re-triggers the
   * `.tab-anim` CSS animation (fade + slight slide) so switching tabs never
   * feels like an instant snap. For the transcript tab specifically, while
   * the meeting is still recording the outer scroll container is pushed to
   * the bottom on every refresh so the newest caption line stays in view.
   */
  renderTabContent(meeting) {
    const el = document.getElementById("tabContent");
    const scrollContainer = document.getElementById("meetingDetail");
    const r = meeting.report;
    let html;

    if (this.activeTab === "summary") {
      html = this.renderSummaryTab(r);
    } else if (this.activeTab === "actions") {
      html = `<div class="card">${
        (r?.actionItems || [])
          .map(
            (a) =>
              `<div class="action-item"><input type="checkbox" ${a.done ? "checked" : ""} disabled><div>${this.esc(a.description)}<small>مسئول: ${this.esc(a.owner || "نامشخص")} - موعد: ${this.esc(a.dueDate || "نامشخص")}</small></div></div>`,
          )
          .join("") || "<p>اقدامی ثبت نشده.</p>"
      }</div>`;
    } else if (this.activeTab === "participation") {
      const participation = meeting.speakerParticipation;
      html = `<div class="card">${
        participation.length
          ? participation
              .map(
                (p) => `<div class="participation-row">
                  <div class="participation-label"><span>${this.esc(p.speaker)}</span><span>${p.percentage}%</span></div>
                  <div class="participation-bar"><div class="participation-fill" style="width:${p.percentage}%"></div></div>
                </div>`,
              )
              .join("")
          : "<p>هنوز داده‌ای برای محاسبه مشارکت ثبت نشده.</p>"
      }</div>`;
    } else if (this.activeTab === "analysis") {
      html = this.renderAnalysisTab(r);
    } else {
      html = `<div class="card">${
        meeting.segments
          .map(
            (s) =>
              `<div class="transcript-line"><span class="time">${formatTime(s.timestampMs - new Date(meeting.startedAt).getTime())}</span><span class="speaker">${this.esc(s.speaker)}</span><span class="text">${this.esc(s.text)}</span></div>`,
          )
          .join("") || "<p>هنوز متنی ثبت نشده.</p>"
      }</div>`;
    }

    el.innerHTML = html;

    // Restart the CSS animation on every tab switch/refresh (removing then
    // re-adding the class with a forced reflow in between is required —
    // browsers won't replay an animation if the class never actually left).
    el.classList.remove("tab-anim");
    void el.offsetWidth;
    el.classList.add("tab-anim");

    if (
      this.activeTab === "transcript" &&
      !meeting.endedAt &&
      scrollContainer
    ) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }

  renderSummaryTab(r) {
    const sectionsHtml = (r?.sections || [])
      .map((s) => {
        const badges = [
          s.type
            ? `<span class="badge">${this.esc(SECTION_TYPE_LABELS[s.type] || s.type)}</span>`
            : "",
          s.tone
            ? `<span class="badge tone-badge tone-${this.esc(s.tone)}">${this.esc(TONE_LABELS[s.tone] || s.tone)}</span>`
            : "",
        ].join(" ");
        return `<div class="card"><h3>${this.esc(s.title)} ${badges}</h3><p>${this.esc(s.content)}</p></div>`;
      })
      .join("");

    return `
      <div class="card"><h3>خلاصه اجرایی</h3><p>${this.esc(r?.executiveSummary || "هنوز گزارشی ساخته نشده.")}</p></div>
      ${sectionsHtml}
      <div class="card"><h3>تصمیمات</h3><ul>${(r?.keyDecisions || []).map((d) => `<li>${this.esc(d)}</li>`).join("") || "<li>-</li>"}</ul></div>
      <div class="card"><h3>سوالات باز</h3><ul>${(r?.openQuestions || []).map((q) => `<li>${this.esc(q)}</li>`).join("") || "<li>-</li>"}</ul></div>
      <div class="card"><h3>ریسک‌ها</h3><ul>${(r?.risks || []).map((rk) => `<li>${this.esc(rk)}</li>`).join("") || "<li>-</li>"}</ul></div>`;
  }

  renderAnalysisTab(r) {
    if (!r)
      return '<div class="card"><p>هنوز گزارشی ساخته نشده - این بخش بعد از «ساخت گزارش با AI» پر می‌شود.</p></div>';

    const e = r.effectivenessScore;
    const hasScore = e && e.score !== null && e.score !== undefined;
    const scoreCard = hasScore
      ? `<div class="card score-card">
          <h3>امتیاز اثربخشی جلسه</h3>
          <div class="score-display"><span class="score-number">${this.esc(String(e.score))}</span><span class="score-max">/ 100</span></div>
          <p>${this.esc(e.summary || "")}</p>
          <div class="score-metrics">
            <div><span>سرعت تصمیم‌گیری</span><b>${this.esc(String(e.decisionSpeed ?? "-"))}</b></div>
            <div><span>وضوح اکشن‌آیتم‌ها</span><b>${this.esc(String(e.actionClarity ?? "-"))}</b></div>
            <div><span>بهره‌وری زمانی</span><b>${this.esc(String(e.timeEfficiency ?? "-"))}</b></div>
            <div><span>توازن مشارکت</span><b>${this.esc(String(e.participationBalance ?? "-"))}</b></div>
          </div>
        </div>`
      : "";

    const topicsCard = r.keyTopics?.length
      ? `<div class="card"><h3>موضوعات کلیدی</h3><ul>${r.keyTopics
          .map(
            (t) =>
              `<li>${this.esc(t.topic)}${t.count ? ` <span class="badge">${this.esc(String(t.count))}</span>` : ""}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const sentimentCard = r.sentimentBySpeaker?.length
      ? `<div class="card"><h3>تحلیل احساسات به‌تفکیک گوینده</h3><ul>${r.sentimentBySpeaker
          .map(
            (s) =>
              `<li>${this.esc(s.speaker)} - ${this.esc(s.sentiment)}${s.note ? ` - ${this.esc(s.note)}` : ""}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const tensionCard = r.tensionMoments?.length
      ? `<div class="card"><h3>لحظات تنش‌دار</h3><ul>${r.tensionMoments
          .map(
            (t) =>
              `<li><b>${this.esc(t.context)}</b> - ${this.esc(t.description)}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const ne = r.namedEntities;
    const nerCard =
      ne &&
      (ne.people?.length ||
        ne.organizations?.length ||
        ne.projects?.length ||
        ne.dates?.length ||
        ne.locations?.length)
        ? `<div class="card"><h3>نهادهای نام‌دار (NER)</h3><ul>
            ${ne.people?.length ? `<li>افراد: ${this.esc(ne.people.join("، "))}</li>` : ""}
            ${ne.organizations?.length ? `<li>شرکت‌ها: ${this.esc(ne.organizations.join("، "))}</li>` : ""}
            ${ne.projects?.length ? `<li>پروژه‌ها: ${this.esc(ne.projects.join("، "))}</li>` : ""}
            ${ne.dates?.length ? `<li>تاریخ‌ها: ${this.esc(ne.dates.join("، "))}</li>` : ""}
            ${ne.locations?.length ? `<li>مکان‌ها: ${this.esc(ne.locations.join("، "))}</li>` : ""}
          </ul></div>`
        : "";

    const glossaryCard = r.glossary?.length
      ? `<div class="card"><h3>واژه‌نامه اصطلاحات تخصصی</h3><ul>${r.glossary
          .map(
            (g) =>
              `<li class="glossary-term"><b>${this.esc(g.term)}</b>: ${this.esc(g.definition)}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const cp = r.conversationPatterns;
    const patternsCard =
      cp && (cp.mostQuestionsBy || cp.mostDecisionsBy || cp.notes)
        ? `<div class="card"><h3>الگوی مکالمه</h3><ul>
            ${cp.mostQuestionsBy ? `<li>بیشترین سوال‌پرسنده: ${this.esc(cp.mostQuestionsBy)}</li>` : ""}
            ${cp.mostDecisionsBy ? `<li>بیشترین تصمیم‌گیرنده: ${this.esc(cp.mostDecisionsBy)}</li>` : ""}
            ${cp.notes ? `<li>${this.esc(cp.notes)}</li>` : ""}
          </ul></div>`
        : "";

    const agreementsCard =
      r.agreements?.length || r.disagreements?.length
        ? `<div class="card"><h3>توافق‌ها و اختلاف‌نظرها</h3>
            <p><b>نقاط توافق:</b></p><ul>${(r.agreements || []).map((a) => `<li>${this.esc(a)}</li>`).join("") || "<li>-</li>"}</ul>
            <p><b>نقاط اختلاف:</b></p><ul>${(r.disagreements || []).map((d) => `<li>${this.esc(d)}</li>`).join("") || "<li>-</li>"}</ul>
          </div>`
        : "";

    const agendaCard = r.suggestedAgenda?.length
      ? `<div class="card"><h3>پیشنهاد دستور جلسه‌ی بعدی</h3><ul>${r.suggestedAgenda
          .map((item) => `<li>${this.esc(item)}</li>`)
          .join("")}</ul></div>`
      : "";

    const cards = [
      scoreCard,
      topicsCard,
      sentimentCard,
      tensionCard,
      nerCard,
      glossaryCard,
      patternsCard,
      agreementsCard,
      agendaCard,
    ]
      .filter(Boolean)
      .join("");

    return (
      cards ||
      '<div class="card"><p>هیچ داده‌ی تحلیلی‌ای در این گزارش موجود نیست.</p></div>'
    );
  }

  async generateReport(meetingId, templateId) {
    const btn = document.getElementById("generateBtn");
    btn.disabled = true;
    btn.textContent = "در حال پردازش...";
    try {
      const raw = await chrome.runtime.sendMessage({
        type: "meeting:generateReport",
        payload: { meetingId, templateId },
      });
      if (raw.error) throw new Error(raw.error);
      this.renderDetail(toMeeting(raw));
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async syncToGithub(meetingId) {
    try {
      const raw = await chrome.runtime.sendMessage({
        type: "meeting:sync",
        payload: { meetingId },
      });
      if (raw.error) throw new Error(raw.error);
      this.renderDetail(toMeeting(raw));
    } catch (err) {
      alert(err.message);
    }
  }

  async openManualModal(meetingId, templateId) {
    const result = await chrome.runtime.sendMessage({
      type: "meeting:buildManualPrompt",
      payload: { meetingId, templateId },
    });
    if (result.error) {
      alert(result.error);
      return;
    }
    this.manualContext = { meetingId, templateId: result.templateId };
    document.getElementById("manualPromptBox").value = result.prompt;
    document.getElementById("manualResultBox").value = "";
    document.getElementById("manualError").textContent = "";
    document.getElementById("manualModal").classList.add("open");
  }

  closeManualModal() {
    document.getElementById("manualModal").classList.remove("open");
    this.manualContext = null;
  }

  async copyManualPrompt() {
    const text = document.getElementById("manualPromptBox").value;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyPromptBtn");
    const original = btn.textContent;
    btn.textContent = "✔ کپی شد";
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }

  async processManualResult() {
    if (!this.manualContext) return;
    const rawText = document.getElementById("manualResultBox").value.trim();
    const errorEl = document.getElementById("manualError");
    if (!rawText) {
      errorEl.textContent = "پاسخ هوش مصنوعی خالی است.";
      return;
    }

    const btn = document.getElementById("processManualBtn");
    btn.disabled = true;
    try {
      const raw = await chrome.runtime.sendMessage({
        type: "meeting:importManualReport",
        payload: {
          meetingId: this.manualContext.meetingId,
          templateId: this.manualContext.templateId,
          rawText,
        },
      });
      if (raw.error) throw new Error(raw.error);
      this.closeManualModal();
      this.renderDetail(toMeeting(raw));
    } catch (err) {
      errorEl.textContent = `خطا در پردازش پاسخ: ${err.message}. مطمئن شوید کل خروجی JSON مدل را بدون تغییر کپی کرده‌اید.`;
    } finally {
      btn.disabled = false;
    }
  }

  esc(str) {
    return String(str).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  }
}

const app = new SidePanelApp();
app.init();
