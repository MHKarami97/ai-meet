import { meetingRepository } from '../db/database.js';
import { formatTime } from '../db/models.js';
import { exporters } from '../export/exporters.js';
import { PROMPT_TEMPLATES } from '../ai/prompt-templates.js';

class SidePanelApp {
  constructor() {
    this.meetings = [];
    this.selectedId = null;
    this.activeTab = 'summary';
    this.pollTimer = null;
  }

  async init() {
    document.getElementById('openOptionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('searchInput').addEventListener('input', (e) => this.loadMeetings(e.target.value));
    await this.loadMeetings();
    this.pollTimer = setInterval(() => this.refreshSelected(), 3000);
  }

  async loadMeetings(search = '') {
    this.meetings = await meetingRepository.getAll({ search });
    this.renderList();
    if (!this.selectedId && this.meetings[0]) {
      this.selectMeeting(this.meetings[0].id);
    }
  }

  async refreshSelected() {
    if (!this.selectedId) return;
    const meeting = await meetingRepository.getById(this.selectedId);
    if (meeting && !meeting.endedAt) this.renderDetail(meeting);
  }

  renderList() {
    const list = document.getElementById('meetingList');
    list.innerHTML = '';
    for (const meeting of this.meetings) {
      const card = document.createElement('div');
      card.className = 'meeting-card' + (meeting.id === this.selectedId ? ' active' : '');
      card.innerHTML = `
        <div class="title">${this.#esc(meeting.title)}</div>
        <div class="meta">${new Date(meeting.startedAt).toLocaleDateString('fa-IR')} · ${formatTime(meeting.durationMs)}</div>
      `;
      card.addEventListener('click', () => this.selectMeeting(meeting.id));
      list.appendChild(card);
    }
  }

  async selectMeeting(id) {
    this.selectedId = id;
    this.activeTab = 'summary';
    this.renderList();
    const meeting = await meetingRepository.getById(id);
    this.renderDetail(meeting);
  }

  renderDetail(meeting) {
    const root = document.getElementById('meetingDetail');
    if (!meeting) {
      root.innerHTML = '<div class="empty-state">جلسه‌ای یافت نشد.</div>';
      return;
    }

    const templateOptions = PROMPT_TEMPLATES.map(
      (t) => `<option value="${t.id}" ${meeting.report?.templateId === t.id ? 'selected' : ''}>${t.name}</option>`
    ).join('');

    root.innerHTML = `
      <div class="detail-header">
        <div>
          <h2>${this.#esc(meeting.title)}</h2>
          <div class="meta">${new Date(meeting.startedAt).toLocaleString('fa-IR')} · مدت: ${formatTime(meeting.durationMs)}
            ${meeting.githubSynced ? '<span class="badge synced">همگام‌سازی شده با GitHub</span>' : '<span class="badge">همگام‌سازی نشده</span>'}
          </div>
        </div>
      </div>

      <div class="actions-row">
        <select id="templateSelect">${templateOptions}</select>
        <button class="btn btn-primary" id="generateBtn">${meeting.report ? 'باز‌تولید خلاصه' : 'تولید خلاصه با AI'}</button>
        <button class="btn btn-secondary" id="syncBtn">همگام‌سازی GitHub</button>
        <button class="btn btn-secondary" data-export="md">خروجی Markdown</button>
        <button class="btn btn-secondary" data-export="doc">خروجی Word</button>
        <button class="btn btn-secondary" data-export="pdf">خروجی PDF</button>
        <button class="btn btn-secondary" data-export="txt">خروجی TXT</button>
      </div>

      <div class="tabs">
        <button class="tab-btn ${this.activeTab === 'summary' ? 'active' : ''}" data-tab="summary">خلاصه و تصمیمات</button>
        <button class="tab-btn ${this.activeTab === 'actions' ? 'active' : ''}" data-tab="actions">اقدامات</button>
        <button class="tab-btn ${this.activeTab === 'transcript' ? 'active' : ''}" data-tab="transcript">رونوشت کامل</button>
      </div>

      <div id="tabContent"></div>
    `;

    document.getElementById('generateBtn').addEventListener('click', () => this.generateReport(meeting.id));
    document.getElementById('syncBtn').addEventListener('click', () => this.syncToGithub(meeting.id));
    document.querySelectorAll('[data-export]').forEach((btn) =>
      btn.addEventListener('click', () => exporters[btn.dataset.export].export(meeting))
    );
    document.querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.renderDetail(meeting);
      })
    );

    this.#renderTabContent(meeting);
  }

  #renderTabContent(meeting) {
    const el = document.getElementById('tabContent');
    const r = meeting.report;

    if (this.activeTab === 'summary') {
      el.innerHTML = `
        <div class="card"><h3>خلاصه اجرایی</h3><p>${this.#esc(r?.executiveSummary || 'هنوز خلاصه‌ای تولید نشده.')}</p></div>
        <div class="card"><h3>تصمیمات کلیدی</h3><ul>${(r?.keyDecisions || []).map((d) => `<li>${this.#esc(d)}</li>`).join('') || '<li>موردی یافت نشد</li>'}</ul></div>
        <div class="card"><h3>سوالات باز</h3><ul>${(r?.openQuestions || []).map((q) => `<li>${this.#esc(q)}</li>`).join('') || '<li>موردی یافت نشد</li>'}</ul></div>
        <div class="card"><h3>ریسک‌ها و نکات مهم</h3><ul>${(r?.risks || []).map((rk) => `<li>${this.#esc(rk)}</li>`).join('') || '<li>موردی یافت نشد</li>'}</ul></div>
      `;
    } else if (this.activeTab === 'actions') {
      el.innerHTML = `<div class="card">${
        (r?.actionItems || [])
          .map(
            (a) => `<div class="action-item"><input type="checkbox" ${a.done ? 'checked' : ''} disabled />
          <div>${this.#esc(a.description)}<small>مسئول: ${this.#esc(a.owner || 'نامشخص')} · موعد: ${this.#esc(a.dueDate || 'نامشخص')}</small></div></div>`
          )
          .join('') || 'هنوز اقدامی ثبت نشده.'
      }</div>`;
    } else {
      el.innerHTML = `<div class="card">${
        meeting.segments
          .map(
            (s) => `<div class="transcript-line"><span class="time">${formatTime(s.timestampMs - meeting.startedAt)}</span><span class="speaker">${this.#esc(s.speaker)}:</span><span class="text">${this.#esc(s.text)}</span></div>`
          )
          .join('') || 'هنوز رونوشتی ثبت نشده.'
      }</div>`;
    }
  }

  async generateReport(meetingId) {
    const templateId = document.getElementById('templateSelect').value;
    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'در دست تولید...';
    try {
      const meeting = await chrome.runtime.sendMessage({ type: 'meeting:generateReport', payload: { meetingId, templateId } });
      if (meeting.error) throw new Error(meeting.error);
      this.renderDetail(meeting);
    } catch (err) {
      alert('خطا در تولید خلاصه: ' + err.message);
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
      alert('خطا در همگام‌سازی: ' + err.message);
    }
  }

  #esc(str = '') {
    return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
}

const app = new SidePanelApp();
app.init();
