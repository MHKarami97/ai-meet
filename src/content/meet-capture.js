/**
 * Reads Google Meet's own live-caption panel (set to Persian, English, etc. by
 * the user inside Meet itself) and streams each finalized line to the
 * background worker with a speaker label and timestamp.
 *
 * Meet frequently changes its internal class names, so several selectors are
 * tried and the script also falls back to a body-wide MutationObserver that
 * waits for the caption container to appear.
 */
const CAPTION_CONTAINER_SELECTORS = [
  '[jsname="tgaKEf"]',
  '[jscontroller="KPn5nb"]',
  'div[aria-label="Captions"]',
  'div[aria-label*="caption" i]'
];
const PERSIAN_RANGE = /[\u0600-\u06FF]/;

class MeetCaptionCapture {
  constructor() {
    this.meetingId = null;
    this.observer = null;
    this.rootObserver = null;
    this.lastLineKey = '';
    this.lastSpeaker = 'ناشناس';
    this.badgeEl = null;
  }

  async start() {
    const settings = await this.getSettings();
    const meeting = await this.sendMessage('meeting:start', {
      meetUrl: location.href,
      language: settings.languageMode === 'manual' ? settings.defaultLanguage : 'auto'
    });
    this.meetingId = meeting.id;
    this.renderBadge();
    this.attachObserver();
    window.addEventListener('beforeunload', () => this.stop());
  }

  async stop() {
    if (!this.meetingId) return;
    this.observer?.disconnect();
    this.rootObserver?.disconnect();
    await this.sendMessage('meeting:end', { meetingId: this.meetingId });
  }

  attachObserver() {
    const tryAttach = () => {
      const container = CAPTION_CONTAINER_SELECTORS.map((sel) => document.querySelector(sel)).find(Boolean);
      if (!container) return false;
      this.observer = new MutationObserver(() => this.onCaptionsMutated(container));
      this.observer.observe(container, { childList: true, subtree: true, characterData: true });
      return true;
    };

    if (tryAttach()) return;

    this.rootObserver = new MutationObserver(() => {
      if (tryAttach()) this.rootObserver.disconnect();
    });
    this.rootObserver.observe(document.body, { childList: true, subtree: true });
  }

  onCaptionsMutated(container) {
    const lines = Array.from(container.querySelectorAll('div, span')).filter((el) => el.textContent?.trim());
    if (lines.length === 0) return;

    const lastEl = lines[lines.length - 1];
    const text = lastEl.textContent.trim();
    if (!text || text === this.lastLineKey) return;
    this.lastLineKey = text;

    const speakerEl = container.querySelector('[aria-label*="speaking" i], .zs7s8d, .KcIKyf');
    this.lastSpeaker = speakerEl?.textContent?.trim() || this.lastSpeaker;

    const language = PERSIAN_RANGE.test(text) ? 'fa' : 'en';
    this.sendMessage('meeting:segment', {
      meetingId: this.meetingId,
      segment: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        speaker: this.lastSpeaker,
        text,
        timestampMs: Date.now(),
        language
      }
    });
  }

  renderBadge() {
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'ai-meet-badge';
    this.badgeEl.innerHTML = '<span class="dot"></span><span>AI Meet در حال ضبط رونوشت است</span>';
    document.body.appendChild(this.badgeEl);
  }

  async getSettings() {
    const stored = await chrome.storage.local.get('settings');
    return stored.settings || { languageMode: 'auto', defaultLanguage: 'fa' };
  }

  sendMessage(type, payload) {
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
