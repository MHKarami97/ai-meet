/**
 * Reads Google Meet's own live-caption panel (set to Persian, English, etc. by
 * the user inside Meet itself) and streams each finalized line to the
 * background worker with a speaker label and timestamp.
 *
 * Google Meet re-renders the SAME utterance repeatedly while the speaker is
 * still talking (interim results growing word by word: "سلام" -> "سلام این"
 * -> "سلام این متن" ...). Instead of saving every growth as a brand-new line,
 * we detect continuations (new text starts with the previous text, same
 * speaker) and UPDATE the same segment in place. A new segment is only
 * created when the text does not extend the previous one (new sentence /
 * new speaker / caption reset).
 *
 * Recording does NOT start automatically: a floating toggle button lets the
 * user explicitly start/stop capturing.
 *
 * Meet frequently changes its internal class names, so several selectors are
 * tried, and known non-caption UI strings (e.g. "Jump to bottom") are
 * filtered out so they never get mistaken for the last caption line.
 */
const CAPTION_CONTAINER_SELECTORS = [
  '[jsname="tgaKEf"]',
  '[jscontroller="KPn5nb"]',
  'div[aria-label="Captions"]',
  'div[aria-label*="caption" i]'
];
const PERSIAN_RANGE = /[\u0600-\u06FF]/;
const NON_CAPTION_TEXT_BLOCKLIST = [
  'jump to bottom',
  'پرش به پایین',
  'پرش به انتها',
  'turn on captions',
  'turn off captions'
];

function isRealCaptionLine(el) {
  if (el.children.length > 0) return false;
  const text = el.textContent?.trim();
  if (!text) return false;
  if (NON_CAPTION_TEXT_BLOCKLIST.includes(text.toLowerCase())) return false;
  if (el.closest('button, [role="button"], a')) return false;
  return true;
}

function createSegmentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

class MeetCaptionCapture {
  constructor() {
    this.meetingId = null;
    this.observer = null;
    this.rootObserver = null;
    this.lastLineText = '';
    this.lastSpeaker = 'ناشناس';
    this.currentSegmentId = null;
    this.badgeEl = null;
    this.isRecording = false;
  }

  init() {
    this.renderBadge();
  }

  async start() {
    if (this.isRecording) return;
    const settings = await this.getSettings();
    const meeting = await this.sendMessage('meeting:start', {
      meetUrl: location.href,
      language: settings.languageMode === 'manual' ? settings.defaultLanguage : 'auto'
    });
    this.meetingId = meeting.id;
    this.isRecording = true;
    this.lastLineText = '';
    this.currentSegmentId = null;
    this.updateBadge();
    this.attachObserver();
  }

  async stop() {
    if (!this.isRecording) return;
    this.observer?.disconnect();
    this.rootObserver?.disconnect();
    this.isRecording = false;
    this.currentSegmentId = null;
    this.updateBadge();
    if (this.meetingId) await this.sendMessage('meeting:end', { meetingId: this.meetingId });
  }

  toggle() {
    if (this.isRecording) this.stop();
    else this.start();
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
    if (!this.isRecording) return;
    const lines = Array.from(container.querySelectorAll('div, span')).filter(isRealCaptionLine);
    if (lines.length === 0) return;

    const lastEl = lines[lines.length - 1];
    const text = lastEl.textContent.trim();
    if (!text || text === this.lastLineText) return;

    const speakerEl = container.querySelector('[aria-label*="speaking" i], .zs7s8d, .KcIKyf');
    const speaker = speakerEl?.textContent?.trim() || this.lastSpeaker;

    const isContinuation =
      this.currentSegmentId !== null &&
      speaker === this.lastSpeaker &&
      this.lastLineText.length > 0 &&
      text.startsWith(this.lastLineText);

    if (!isContinuation) {
      this.currentSegmentId = createSegmentId();
    }

    this.lastLineText = text;
    this.lastSpeaker = speaker;

    const language = PERSIAN_RANGE.test(text) ? 'fa' : 'en';
    this.sendMessage('meeting:segment', {
      meetingId: this.meetingId,
      segment: {
        id: this.currentSegmentId,
        speaker,
        text,
        timestampMs: Date.now(),
        language
      }
    });
  }

  renderBadge() {
    this.badgeEl = document.createElement('button');
    this.badgeEl.type = 'button';
    this.badgeEl.className = 'ai-meet-badge stopped';
    this.badgeEl.innerHTML = '<span class="dot"></span><span>AI Meet — برای شروع ضبط کلیک کنید</span>';
    this.badgeEl.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.badgeEl);
    window.addEventListener('beforeunload', () => this.stop());
  }

  updateBadge() {
    if (!this.badgeEl) return;
    this.badgeEl.classList.toggle('stopped', !this.isRecording);
    this.badgeEl.innerHTML = this.isRecording
      ? '<span class="dot"></span><span>AI Meet در حال ضبط — کلیک برای پایان</span>'
      : '<span class="dot"></span><span>AI Meet — برای شروع ضبط کلیک کنید</span>';
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

function waitForMeetingUiThenInit() {
  const readyCheck = setInterval(() => {
    const inMeeting = document.querySelector('[data-meeting-title], [jsname="HlFzId"]');
    if (inMeeting) {
      clearInterval(readyCheck);
      capture.init();
    }
  }, 1500);
}

waitForMeetingUiThenInit();
