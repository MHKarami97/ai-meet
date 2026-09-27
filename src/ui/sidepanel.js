import "./theme.js";
import { applyUiLanguage } from "./ui-language.js";
import { i18n } from "../i18n/i18n.js";
import { formatTime, Meeting } from "../db/models.js";
import { exporters } from "../export/exporters.js";
import { PROMPT_TEMPLATES } from "../ai/prompt-templates.js";
import { settingsStore } from "../background/settings-store.js";
import { PROVIDER_TYPES } from "../ai/providers.js";

function toMeeting(raw) {
  return raw ? new Meeting(raw) : null;
}

function toneLabel(tone) {
  var key = {
    formal: "tone_formal",
    informal: "tone_informal",
    critical: "tone_critical",
  }[tone];
  return key ? i18n.t(key) : tone;
}

function sectionTypeLabel(type) {
  var key = {
    presentation: "section_type_presentation",
    discussion: "section_type_discussion",
    "task-assignment": "section_type_task_assignment",
    "status-report": "section_type_status_report",
  }[type];
  return key ? i18n.t(key) : type;
}

const LIST_COLLAPSED_KEY = "ui:meetingListCollapsed";

class SidePanelApp {
  constructor() {
    this.meetings = [];
    this.selectedId = null;
    this.currentMeeting = null;
    this.activeTab = "transcript";
    this.durationTimer = null;
    this.manualContext = null;
    this.autoScrollEnabled = true;
    this.listCollapsed = false;
  }

  async init() {
    await applyUiLanguage(() => this.onLanguageChanged());
    await this.initListCollapse();

    document
      .getElementById("openOptionsBtn")
      .addEventListener("click", () => chrome.runtime.openOptionsPage());
    document
      .getElementById("toggleListBtn")
      .addEventListener("click", () => this.toggleListCollapse());
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
      } else if (
        message.type === "meeting:segmentUpdated" &&
        this.currentMeeting?.id === message.payload?.meetingId
      ) {
        this.patchSegment(message.payload.segment);
      } else if (
        message.type === "meeting:ended" &&
        this.currentMeeting?.id === message.payload?.meetingId
      ) {
        this.selectMeeting(message.payload.meetingId);
      }
      this.loadMeetings();
    });

    await this.loadMeetings();
  }

  /** Re-renders every dynamic, JS-built piece of text after a live language change. */
  onLanguageChanged() {
    this.renderList();
    if (this.currentMeeting) this.renderDetail(this.currentMeeting);
  }

  async initListCollapse() {
    const stored = await chrome.storage.local.get(LIST_COLLAPSED_KEY);
    this.listCollapsed = !!stored[LIST_COLLAPSED_KEY];
    this.applyListCollapseState();
  }

  toggleListCollapse() {
    this.listCollapsed = !this.listCollapsed;
    this.applyListCollapseState();
    chrome.storage.local.set({ [LIST_COLLAPSED_KEY]: this.listCollapsed });
  }

  applyListCollapseState() {
    document
      .getElementById("meetingList")
      .classList.toggle("collapsed", this.listCollapsed);
  }

  async loadMeetings(search) {
    const raw = await chrome.runtime.sendMessage({
      type: search ? "meeting:search" : "meeting:list",
      payload: { query: search },
    });
    this.meetings = raw.map(toMeeting);
    this.renderList();
    if (!this.selectedId && this.meetings[0])
      this.selectMeeting(this.meetings[0].id);
  }

  renderList() {
    const list = document.getElementById("meetingList");
    list.innerHTML = "";
    for (const meeting of this.meetings) {
      const card = document.createElement("div");
      card.className =
        "meeting-card" + (meeting.id === this.selectedId ? " active" : "");
      card.dataset.id = meeting.id;
      card.innerHTML = `
        <div class="title">${this.esc(meeting.title)}</div>
        <div class="meta">
          <span>${new Date(meeting.startedAt).toLocaleDateString(i18n.lang === "fa" ? "fa-IR" : "en-US")}</span>
          <span class="list-duration">${formatTime(meeting.durationMs)}</span>
        </div>`;
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

  patchSegment(segment) {
    if (!this.currentMeeting) return;
    const idx = this.currentMeeting.segments.findIndex(
      (s) => s.id === segment.id,
    );
    if (idx >= 0) this.currentMeeting.segments[idx] = segment;
    else this.currentMeeting.segments.push(segment);
    if (this.activeTab === "transcript")
      this.renderTabContent(this.currentMeeting, { animate: false });
  }

  async renderDetail(meeting) {
    this.stopDurationTicker();
    this.currentMeeting = meeting;
    const root = document.getElementById("meetingDetail");
    if (!meeting) {
      root.innerHTML = `<div class="empty-state" data-i18n="sidepanel_empty_state"></div>`;
      i18n.translateDom(root);
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

    const generateLabel = meeting.report
      ? i18n.t("sidepanel_regenerate")
      : isManualProvider
        ? i18n.t("sidepanel_generate_manual")
        : i18n.t("sidepanel_generate_ai");

    root.innerHTML = `
      <div class="detail-header">
        <div>
          <h2>${this.esc(meeting.title)}</h2>
          <div class="meta">
            <span>${new Date(meeting.startedAt).toLocaleString(i18n.lang === "fa" ? "fa-IR" : "en-US")}</span>
            <span id="durationText">${formatTime(meeting.durationMs)}</span>
            ${meeting.syncedToGithub ? `<span class="badge synced">${this.esc(i18n.t("sidepanel_synced_badge"))}</span>` : ""}
          </div>
        </div>
        <div class="actions-row">
          <select id="templateSelect">${templateOptions}</select>
          <div class="btn-row">
            <button class="btn btn-primary" id="generateBtn">${this.esc(generateLabel)}</button>
            <button class="btn btn-secondary" id="syncBtn">${this.esc(i18n.t("sidepanel_sync_button"))}</button>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary small-btn" data-export="doc">${this.esc(i18n.t("sidepanel_export_word"))}</button>
            <button class="btn btn-secondary small-btn" data-export="pdf">${this.esc(i18n.t("sidepanel_export_pdf"))}</button>
            <button class="btn btn-secondary small-btn" data-export="txt">${this.esc(i18n.t("sidepanel_export_txt"))}</button>
            <button class="btn btn-secondary small-btn" data-export="md">${this.esc(i18n.t("sidepanel_export_markdown"))}</button>
          </div>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${this.activeTab === "transcript" ? "active" : ""}" data-tab="transcript">${this.esc(i18n.t("sidepanel_tab_transcript"))}</button>
        <button class="tab-btn ${this.activeTab === "summary" ? "active" : ""}" data-tab="summary">${this.esc(i18n.t("sidepanel_tab_summary"))}</button>
        <button class="tab-btn ${this.activeTab === "actions" ? "active" : ""}" data-tab="actions">${this.esc(i18n.t("sidepanel_tab_actions"))}</button>
        <button class="tab-btn ${this.activeTab === "participation" ? "active" : ""}" data-tab="participation">${this.esc(i18n.t("sidepanel_tab_participation"))}</button>
        <button class="tab-btn ${this.activeTab === "analysis" ? "active" : ""}" data-tab="analysis">${this.esc(i18n.t("sidepanel_tab_analysis"))}</button>
      </div>
      <div id="tabContent"></div>
      <button class="autoscroll-toggle ${this.autoScrollEnabled ? "" : "paused"}" id="autoScrollToggleBtn">
        ${this.esc(this.autoScrollEnabled ? i18n.t("sidepanel_autoscroll_on") : i18n.t("sidepanel_autoscroll_off"))}
      </button>
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
    document
      .getElementById("autoScrollToggleBtn")
      .addEventListener("click", (e) => {
        this.autoScrollEnabled = !this.autoScrollEnabled;
        e.currentTarget.classList.toggle("paused", !this.autoScrollEnabled);
        e.currentTarget.textContent = this.autoScrollEnabled
          ? i18n.t("sidepanel_autoscroll_on")
          : i18n.t("sidepanel_autoscroll_off");
      });

    this.renderTabContent(meeting, { animate: true });
    this.startDurationTicker(meeting);
  }

  startDurationTicker(meeting) {
    if (meeting.endedAt) return;
    const startedAtMs = new Date(meeting.startedAt).getTime();
    this.durationTimer = setInterval(() => {
      const liveText = formatTime(Date.now() - startedAtMs);
      const durationEl = document.getElementById("durationText");
      if (durationEl) durationEl.textContent = liveText;
      const listDurationEl = document.querySelector(
        `.meeting-card[data-id="${meeting.id}"] .list-duration`,
      );
      if (listDurationEl) listDurationEl.textContent = liveText;
    }, 1000);
  }

  stopDurationTicker() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = null;
  }

  renderTabContent(meeting, { animate = true } = {}) {
    const el = document.getElementById("tabContent");
    const scrollContainer = document.getElementById("meetingDetail");
    const autoScrollBtn = document.getElementById("autoScrollToggleBtn");
    const r = meeting.report;
    let html;

    if (this.activeTab === "summary") {
      html = this.renderSummaryTab(r);
    } else if (this.activeTab === "actions") {
      html = r?.actionItems?.length
        ? `<div class="card">${r.actionItems
            .map(
              (a) => `<div class="action-item">
                <input type="checkbox" ${a.done ? "checked disabled" : ""}>
                <div>${this.esc(a.description)}<small>${this.esc(a.owner)}${a.owner && a.dueDate ? " - " : ""}${this.esc(a.dueDate)}</small></div>
              </div>`,
            )
            .join("")}</div>`
        : `<div class="card"><p>${this.esc(i18n.t("sidepanel_no_analysis"))}</p></div>`;
    } else if (this.activeTab === "participation") {
      html = this.renderParticipationTab(meeting);
    } else if (this.activeTab === "analysis") {
      html = this.renderAnalysisTab(r);
    } else {
      html = `<div class="card">${meeting.segments
        .map(
          (s) => `<div class="transcript-line">
            <div class="line-header">
              <span class="time">${formatTime(s.timestampMs - new Date(meeting.startedAt).getTime())}</span>
              <span class="speaker">${this.esc(s.speaker)}</span>
            </div>
            <span class="text">${this.esc(s.text)}</span>
          </div>`,
        )
        .join("")}</div>`;
    }

    el.innerHTML = html;
    if (animate) {
      el.classList.remove("tab-anim");
      void el.offsetWidth;
      el.classList.add("tab-anim");
    }

    if (this.activeTab === "participation") {
      el.querySelectorAll(".participation-fill").forEach((fillEl) => {
        const raw = parseFloat(fillEl.dataset.pct);
        const clamped = Number.isFinite(raw)
          ? Math.min(100, Math.max(0, raw))
          : 0;
        fillEl.style.width = clamped + "%";
      });
    }
    if (autoScrollBtn)
      autoScrollBtn.style.display =
        this.activeTab === "transcript" ? "flex" : "none";
    if (
      this.activeTab === "transcript" &&
      !meeting.endedAt &&
      this.autoScrollEnabled
    ) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }

  renderParticipationTab(meeting) {
    const participation = meeting.speakerParticipation;
    if (!participation.length)
      return `<div class="card"><p>${this.esc(i18n.t("sidepanel_no_participation"))}</p></div>`;
    return `<div class="card">${participation
      .map(
        (p) => `<div class="participation-row">
          <div class="participation-label"><span>${this.esc(p.speaker)}</span><span>${p.percentage}%</span></div>
          <div class="participation-bar"><div class="participation-fill" data-pct="${p.percentage}"></div></div>
        </div>`,
      )
      .join("")}</div>`;
  }

  renderSummaryTab(r) {
    if (!r)
      return `<div class="card"><p>${this.esc(i18n.t("sidepanel_no_analysis"))}</p></div>`;

    const sectionsHtml = (r.sections || [])
      .map((s) => {
        const badges = [
          s.type
            ? `<span class="badge">${this.esc(sectionTypeLabel(s.type))}</span>`
            : "",
          s.tone
            ? `<span class="badge tone-badge tone-${this.esc(s.tone)}">${this.esc(toneLabel(s.tone))}</span>`
            : "",
        ].join("");
        return `<div class="card"><h3>${this.esc(s.title)} ${badges}</h3><p>${this.esc(s.content)}</p></div>`;
      })
      .join("");

    return `<div class="card"><h3>${this.esc(i18n.t("sidepanel_executive_summary_heading"))}</h3><p>${this.esc(r.executiveSummary)}</p></div>${sectionsHtml}
      <div class="card"><h3>${this.esc(i18n.t("sidepanel_key_decisions_heading"))}</h3><ul>${(r.keyDecisions || []).map((d) => `<li>${this.esc(d)}</li>`).join("")}</ul></div>
      <div class="card"><h3>${this.esc(i18n.t("sidepanel_open_questions_heading"))}</h3><ul>${(r.openQuestions || []).map((q) => `<li>${this.esc(q)}</li>`).join("")}</ul></div>
      <div class="card"><h3>${this.esc(i18n.t("sidepanel_risks_heading"))}</h3><ul>${(r.risks || []).map((rk) => `<li>${this.esc(rk)}</li>`).join("")}</ul></div>`;
  }

  renderAnalysisTab(r) {
    if (!r)
      return `<div class="card"><p>${this.esc(i18n.t("sidepanel_no_analysis"))}</p></div>`;
    const e = r.effectivenessScore;
    const hasScore = e && e.score !== null && e.score !== undefined;

    const scoreCard = hasScore
      ? `<div class="card score-card">
          <h3>${this.esc(i18n.t("sidepanel_effectiveness_heading"))}</h3>
          <div class="score-display"><span class="score-number">${this.esc(String(e.score))}</span><span class="score-max">/100</span></div>
          <p>${this.esc(e.summary)}</p>
        </div>`
      : "";

    const topicsCard = r.keyTopics?.length
      ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_key_topics_heading"))}</h3><ul>${r.keyTopics
          .map(
            (t) =>
              `<li>${this.esc(t.topic)}${t.count ? ` <span class="badge">${this.esc(String(t.count))}</span>` : ""}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const sentimentCard = r.sentimentBySpeaker?.length
      ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_sentiment_heading"))}</h3><ul>${r.sentimentBySpeaker
          .map(
            (s) =>
              `<li>${this.esc(s.speaker)} - ${this.esc(s.sentiment)}${s.note ? " - " + this.esc(s.note) : ""}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const tensionCard = r.tensionMoments?.length
      ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_tension_heading"))}</h3><ul>${r.tensionMoments
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
        ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_ner_heading"))}</h3><ul>
            ${ne.people?.length ? `<li>${this.esc(ne.people.join("، "))}</li>` : ""}
            ${ne.organizations?.length ? `<li>${this.esc(ne.organizations.join("، "))}</li>` : ""}
            ${ne.projects?.length ? `<li>${this.esc(ne.projects.join("، "))}</li>` : ""}
            ${ne.dates?.length ? `<li>${this.esc(ne.dates.join("، "))}</li>` : ""}
            ${ne.locations?.length ? `<li>${this.esc(ne.locations.join("، "))}</li>` : ""}
          </ul></div>`
        : "";

    const glossaryCard = r.glossary?.length
      ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_glossary_heading"))}</h3><ul>${r.glossary
          .map(
            (g) =>
              `<li class="glossary-term"><b>${this.esc(g.term)}</b> ${this.esc(g.definition)}</li>`,
          )
          .join("")}</ul></div>`
      : "";

    const cp = r.conversationPatterns;
    const patternsCard =
      cp && (cp.mostQuestionsBy || cp.mostDecisionsBy || cp.notes)
        ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_patterns_heading"))}</h3><ul>
            ${cp.mostQuestionsBy ? `<li>${this.esc(cp.mostQuestionsBy)}</li>` : ""}
            ${cp.mostDecisionsBy ? `<li>${this.esc(cp.mostDecisionsBy)}</li>` : ""}
            ${cp.notes ? `<li>${this.esc(cp.notes)}</li>` : ""}
          </ul></div>`
        : "";

    const agreementsCard =
      r.agreements?.length || r.disagreements?.length
        ? `<div class="card">
            <h3>${this.esc(i18n.t("sidepanel_agreements_heading"))}</h3>
            <ul>${(r.agreements || []).map((a) => `<li>${this.esc(a)}</li>`).join("")}</ul>
            <h3>${this.esc(i18n.t("sidepanel_disagreements_heading"))}</h3>
            <ul>${(r.disagreements || []).map((d) => `<li>${this.esc(d)}</li>`).join("")}</ul>
          </div>`
        : "";

    const agendaCard = r.suggestedAgenda?.length
      ? `<div class="card"><h3>${this.esc(i18n.t("sidepanel_agenda_heading"))}</h3><ul>${r.suggestedAgenda
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
      `<div class="card"><p>${this.esc(i18n.t("sidepanel_no_analysis"))}</p></div>`
    );
  }

  async generateReport(meetingId, templateId) {
    const btn = document.getElementById("generateBtn");
    btn.disabled = true;
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
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }

  async processManualResult() {
    if (!this.manualContext) return;
    const rawText = document.getElementById("manualResultBox").value.trim();
    const errorEl = document.getElementById("manualError");
    if (!rawText) {
      errorEl.textContent = i18n.t("sidepanel_manual_missing_text");
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
      errorEl.textContent =
        err.message || i18n.t("sidepanel_manual_parse_error");
    } finally {
      btn.disabled = false;
    }
  }

  esc(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
}

const app = new SidePanelApp();
app.init();
