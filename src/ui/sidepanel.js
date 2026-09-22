import { formatTime } from '../db/models.js';
import { exporters } from '../export/exporters.js';
import { PROMPT_TEMPLATES } from '../ai/prompt-templates.js';
import { settingsStore } from '../background/settings-store.js';
import { PROVIDER_TYPES } from '../ai/providers.js';

class SidePanelApp {
  constructor() {
    this.meetings = [];
    this.selectedId = null;
    this.activeTab = 'transcript';
    this.pollTimer = null;
    this.manualContext = null;
  }

  async init() {
    document.getElementById('openOptionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('searchInput').addEventListener('input', (e) => this.loadMeetings(e.target.value));
    document.getElementById('closeManualModal').addEventListener('click', () => this.closeManualModal());
    document.getElementById('copyPromptBtn').addEventListener('click', () => this.copyManualPrompt());
    document.getElementById('processManualBtn').addEventListener('click', () => this.processManualResult());

    await this.loadMeetings();
    this.pollTimer = setInterval(() => this.refreshSelected(), 3000);
  }

  async loadMeetings(search) {
    this.meetings = await chrome.runtime.sendMessage({ type: search ? 'meeting:search' : 'meeting:list', payload: { query: search } });
    this.renderList();
    if (!this.selectedId && this.meetings[0]) this.selectMeeting(this.meetings[0].id);
  }

  async refreshSelected() {
    if (!this.selectedId) return;
    const meeting = await chrome.runtime.sendMessage({ type: 'meeting:get', payload: { id: this.selectedId } });
    if (meeting && !meeting.endedAt) this.renderDetail(meeting);
  }

  renderList() {
    const list = document.getElementById('meetingList');
    list.innerHTML = '';
    for (const meeting of this.meetings) {
      const card = document.createElement('div');
      card.className = `meeting-card ${meeting.id === this.selectedId ? 'active' : ''}`;
      card.innerHTML = `
        <div class="title">${this.esc(meeting.title)}</div>
        <div class="meta">${new Date(meeting.startedAt).toLocaleDateString('fa-IR')} · ${formatTime(meeting.durationMs)}</div>`;
      card.addEventListener('click', () => this.selectMeeting(meeting.id));
      list.appendChild(card);
    }
  }

  async selectMeeting(id) {
    this.selectedId = id;
    this.activeTab = 'transcript';
    this.renderList();
    const meeting = await chrome.runtime.sendMessage({ type: 'meeting:get', payload: { id } });
    this.renderDetail(meeting);
  }

  async renderDetail(meeting) {
    const root = document.getElementById('meetingDetail');
    if (!meeting) {
      root.innerHTML = '<div class="empty-state">جلسه‌ای انتخاب نشده.</div>';
      return;
    }
    const settings = await settingsStore.getAll();
    const allTemplates = [...PROMPT_TEMPLATES, ...settings.customTemplates];
    const activeProvider = settings.providers.find((p) => p.id === settings.activeProviderId);
    const isManualProvider = activeProvider?.type === PROVIDER_TYPES.MANUAL;

    const templateOptions = allTemplates
      .map((t) => `<option value="${t.id}" ${meeting.report?.templateId === t.id ? 'selected' : ''}>${this.esc(t.name)}</option>`)
      .join('');

    root.innerHTML = `
      <div class="detail-header">
        <div>
          <h2>${this.esc(meeting.title)}</h2>
          <div class="meta">
            ${new Date(meeting.startedAt).toLocaleString('fa-IR')} · ${formatTime(meeting.durationMs)}
            ${meeting.syncedToGithub ? '<span class="badge synced">✔ GitHub</span>' : '<span class="badge">همگام‌سازی نشده</span>'}
          </div>
        </div>
      </div>
      <div class="actions-row">
        <select id="templateSelect">${templateOptions}</select>
        <button class="btn btn-primary" id="generateBtn">${meeting.report ? '🔁 بازسازی گزارش' : (isManualProvider ? '📋 ساخت متن برای AI' : '✨ ساخت گزارش با AI')}</button>
        <button class="btn btn-secondary" id="syncBtn">☁️ همگام‌سازی با GitHub</button>
        <button class="btn btn-secondary" data-export="doc">⬇ Word</button>
        <button class="btn btn-secondary" data-export="pdf">⬇ PDF</button>
        <button class="btn btn-secondary" data-export="txt">⬇ TXT</button>
        <button class="btn btn-secondary" data-export="md">⬇ Markdown</button>
      </div>
      <div class="tabs">
        <button class="tab-btn ${this.activeTab === 'transcript' ? 'active' : ''}" data-tab="transcript">متن کامل</button>
        <button class="tab-btn ${this.activeTab === 'summary' ? 'active' : ''}" data-tab="summary">خلاصه و تصمیمات</button>
        <button class="tab-btn ${this.activeTab === 'actions' ? 'active' : ''}" data-tab="actions">اقدامات</button>
      </div>
      <div id="tabContent"></div>
    `;

    document.getElementById('generateBtn').addEventListener('click', () => {
      const templateId = document.getElementById('templateSelect').value;
      if (isManualProvider) this.openManualModal(meeting.id, templateId);
      else this.generateReport(meeting.id, templateId);
    });
    document.getElementById('syncBtn').addEventListener('click', () => this.syncToGithub(meeting.id));
    document.querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => exporters[btn.dataset.export].export(meeting));
    });
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.renderDetail(meeting);
      });
    });

    this.renderTabContent(meeting);
  }

  renderTabContent(meeting) {
    const el = document.getElementById('tabContent');
    const r = meeting.report;

    if (this.activeTab === 'summary') {
      el.innerHTML = `
        <div class="card"><h3>خلاصه اجرایی</h3><p>${this.esc(r?.executiveSummary || 'هنوز گزارشی ساخته نشده.')}</p></div>
        <div class="card"><h3>تصمیمات</h3><ul>${(r?.keyDecisions || []).map((d) => `<li>${this.esc(d)}</li>`).join('') || '<li>-</li>'}</ul></div>
        <div class="card"><h3>سوالات باز</h3><ul>${(r?.openQuestions || []).map((q) => `<li>${this.esc(q)}</li>`).join('') || '<li>-</li>'}</ul></div>
        <div class="card"><h3>ریسک‌ها</h3><ul>${(r?.risks || []).map((rk) => `<li>${this.esc(rk)}</li>`).join('') || '<li>-</li>'}</ul></div>`;
    } else if (this.activeTab === 'actions') {
      el.innerHTML = `<div class="card">${
        (r?.actionItems || [])
          .map((a) => `<div class="action-item"><input type="checkbox" ${a.done ? 'checked' : ''} disabled><div>${this.esc(a.description)}<small>مسئول: ${this.esc(a.owner || 'نامشخص')} — موعد: ${this.esc(a.dueDate || 'نامشخص')}</small></div></div>`)
          .join('') || '<p>اقدامی ثبت نشده.</p>'
      }</div>`;
    } else {
      el.innerHTML = `<div class="card">${
        meeting.segments
          .map((s) => `<div class="transcript-line"><span class="time">${formatTime(s.timestampMs - new Date(meeting.startedAt).getTime())}</span><span class="speaker">${this.esc(s.speaker)}</span><span class="text">${this.esc(s.text)}</span></div>`)
          .join('') || '<p>هنوز متنی ثبت نشده.</p>'
      }</div>`;
    }
  }

  async generateReport(meetingId, templateId) {
    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'در حال پردازش...';
    try {
      const meeting = await chrome.runtime.sendMessage({ type: 'meeting:generateReport', payload: { meetingId, templateId } });
      if (meeting.error) throw new Error(meeting.error);
      this.renderDetail(meeting);
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async syncToGithub(meetingId) {
    try {
      const meeting = await chrome.runtime.sendMessage({ type: 'meeting:sync', payload: { meetingId } });
      if (meeting.error) throw new Error(meeting.error);
      this.renderDetail(meeting);
    } catch (err) {
      alert(err.message);
    }
  }

  async openManualModal(meetingId, templateId) {
    const result = await chrome.runtime.sendMessage({ type: 'meeting:buildManualPrompt', payload: { meetingId, templateId } });
    if (result.error) { alert(result.error); return; }
    this.manualContext = { meetingId, templateId: result.templateId };
    document.getElementById('manualPromptBox').value = result.prompt;
    document.getElementById('manualResultBox').value = '';
    document.getElementById('manualError').textContent = '';
    document.getElementById('manualModal').classList.add('open');
  }

  closeManualModal() {
    document.getElementById('manualModal').classList.remove('open');
    this.manualContext = null;
  }

  async copyManualPrompt() {
    const text = document.getElementById('manualPromptBox').value;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copyPromptBtn');
    const original = btn.textContent;
    btn.textContent = '✔ کپی شد';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }

  async processManualResult() {
    if (!this.manualContext) return;
    const rawText = document.getElementById('manualResultBox').value.trim();
    const errorEl = document.getElementById('manualError');
    if (!rawText) { errorEl.textContent = 'پاسخ هوش مصنوعی خالی است.'; return; }

    const btn = document.getElementById('processManualBtn');
    btn.disabled = true;
    try {
      const meeting = await chrome.runtime.sendMessage({
        type: 'meeting:importManualReport',
        payload: { meetingId: this.manualContext.meetingId, templateId: this.manualContext.templateId, rawText }
      });
      if (meeting.error) throw new Error(meeting.error);
      this.closeManualModal();
      this.renderDetail(meeting);
    } catch (err) {
      errorEl.textContent = `خطا در پردازش پاسخ: ${err.message}. مطمئن شوید کل خروجی JSON مدل را بدون تغییر کپی کرده‌اید.`;
    } finally {
      btn.disabled = false;
    }
  }

  esc(str) {
    return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
}

const app = new SidePanelApp();
app.init();
