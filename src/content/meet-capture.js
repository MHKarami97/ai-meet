/**
 * این اسکریپت داخل تب Google Meet اجرا می‌شود. وظیفه:
 * 1) فعال‌سازی زیرنویس زنده روی زبان موردنظر (منوی داخلی Meet)
 * 2) خواندن پنل زیرنویس با MutationObserver و استخراج گوینده/متن
 * 3) ارسال هر خط نهایی‌شده به background برای ذخیره‌سازی
 *
 * هشدار: DOM گوگل میت مداوم تغییر می‌کند. اگر پس از یک به‌روزرسانی متوقف شد،
 * اولین جا برای بررسی، CAPTION_CONTAINER_SELECTORS و توابع استخراج متن/گوینده هستند.
 */

const CAPTION_CONTAINER_SELECTORS = [
  '[jsname="dsyhDe"]',
  '[jscontroller="KPn5nb"]',
  'div[aria-label*="Captions"]',
  'div[aria-label*="زیرنویس"]',
];

const PERSIAN_RANGE = /[\u0600-\u06FF]/;

class MeetCaptionCapture {
  constructor() {
    this.meetingId = null;
    this.observer = null;
    this.lastLineKey = '';
    this.lastSpeaker = null;
    this.badgeEl = null;
  }

  async start() {
    const settings = await this.#getSettings();
    const meeting = await this.#sendMessage('meeting:start', {
      meetUrl: location.href,
      language: settings.languageMode === 'manual' ? settings.defaultLanguage : 'auto',
    });
    this.meetingId = meeting.id;
    this.#renderBadge();
    this.#attachObserver();
    window.addEventListener('beforeunload', () => this.stop());
  }

  async stop() {
    if (!this.meetingId) return;
    this.observer?.disconnect();
    await this.#sendMessage('meeting:end', { meetingId: this.meetingId });
  }

  #attachObserver() {
    const tryAttach = () => {
      const container = CAPTION_CONTAINER_SELECTORS.map((sel) => document.querySelector(sel)).find(Boolean);
      if (!container) return false;
      this.observer = new MutationObserver(() => this.#onCaptionsMutated(container));
      this.observer.observe(container, { childList: true, subtree: true, characterData: true });
      return true;
    };

    if (!tryAttach()) {
      const rootObserver = new MutationObserver(() => {
        if (tryAttach()) rootObserver.disconnect();
      });
      rootObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  #onCaptionsMutated(container) {
    const lines = Array.from(container.querySelectorAll('div, span')).filter((el) => el.textContent?.trim());
    if (lines.length === 0) return;

    const lastEl = lines[lines.length - 1];
    const text = lastEl.textContent.trim();
    if (!text || text === this.lastLineKey) return;

    const speakerEl = container.querySelector('[aria-label*="speaking"], .zs7s8d, .KcIKyf');
    const speaker = speakerEl?.textContent?.trim() || this.lastSpeaker || 'نامشخص';
    this.lastSpeaker = speaker;
    this.lastLineKey = text;

    const language = PERSIAN_RANGE.test(text) ? 'fa' : 'en';

    this.#sendMessage('meeting:segment', {
      meetingId: this.meetingId,
      segment: {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        speaker,
        text,
        timestampMs: Date.now(),
        language,
      },
    });
  }

  #renderBadge() {
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'ai-meet-badge';
    this.badgeEl.innerHTML = '<span class="dot"></span><span>AI Meet در حال ضبط رونوشت</span>';
    document.body.appendChild(this.badgeEl);
  }

  async #getSettings() {
    const stored = await chrome.storage.local.get('settings');
    return stored.settings || { languageMode: 'auto', defaultLanguage: 'fa' };
  }

  #sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
}

const capture = new MeetCaptionCapture();

function waitForMeetingUiThenStart() {
  const readyCheck = setInterval(() => {
    const inMeeting = document.querySelector('[data-meeting-title], [jsname="HlFzId"]');
    if (inMeeting) {
      clearInterval(readyCheck);
      capture.start();
    }
  }, 1500);
}

waitForMeetingUiThenStart();
