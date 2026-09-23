/**
 * Reads Google Meet's own live-caption panel (set to Persian, English, etc. by
 * the user, or auto-attempted by this script) and streams each finalized
 * line to the background worker with a speaker label and timestamp.
 *
 * On start:
 *   1. Requests the extension side panel to open (must happen synchronously,
 *      before any await, to stay inside Chrome's "user gesture" window —
 *      see https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
 *   2. Clicks Google Meet's own Captions toggle button (best-effort, matched
 *      by aria-label keywords since Meet has no stable public selector).
 *   3. Best-effort attempts to switch the caption language to the one chosen
 *      in AI Meet's settings. This step is experimental: Google Meet's
 *      caption-language menu has no documented selector and its DOM changes
 *      between releases, so this silently no-ops if it can't find the menu.
 *      Setting the language manually once in Meet is the reliable fallback —
 *      Meet remembers it for future meetings.
 *
 * On stop: only turns Google Meet's Captions panel back OFF. The extension's
 * side panel is intentionally left open (Chrome extensions have no API to
 * close a side panel programmatically, and the user asked for it to stay).
 *
 * Google Meet re-renders the SAME utterance repeatedly while the speaker is
 * still talking (interim results growing word by word). Instead of saving
 * every growth as a brand-new line, continuations (new text starts with the
 * previous text, same speaker) UPDATE the same segment in place.
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
const CAPTION_TOGGLE_KEYWORDS = ['caption', 'زیرنویس'];
const CAPTION_LANGUAGE_KEYWORDS = ['caption language', 'زبان زیرنویس'];
const LANGUAGE_DISPLAY_NAMES = { fa: ['فارسی', 'Persian', 'Farsi'], en: ['English'], ar: ['العربیة', 'Arabic'] };

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

function findSpeakerForLine(container, lineEl) {
  let block = lineEl;
  while (block.parentElement && block.parentElement !== container) {
    block = block.parentElement;
  }
  if (!block || block === container) return null;

  const lineText = lineEl.textContent.trim();
  const leaves = Array.from(block.querySelectorAll('div, span')).filter(isRealCaptionLine);
  const nameEl = leaves.find((el) => el !== lineEl && el.textContent.trim() !== lineText);
  return nameEl?.textContent?.trim() || null;
}

function isCaptionsPanelVisible() {
  return CAPTION_CONTAINER_SELECTORS.some((sel) => document.querySelector(sel));
}

function findButtonByLabelKeywords(keywords) {
  const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
  return buttons.find((b) => {
    const label = b.getAttribute('aria-label').toLowerCase();
    return keywords.some((k) => label.includes(k.toLowerCase()));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort: clicks Meet's own Captions toggle. Returns true if a click happened. */
function enableCaptions() {
  if (isCaptionsPanelVisible()) return true;
  const btn = findButtonByLabelKeywords(CAPTION_TOGGLE_KEYWORDS);
  if (!btn) return false;
  btn.click();
  return true;
}

function disableCaptions() {
  if (!isCaptionsPanelVisible()) return;
  const btn = findButtonByLabelKeywords(CAPTION_TOGGLE_KEYWORDS);
  if (btn) btn.click();
}

/**
 * EXPERIMENTAL / best-effort. Tries to open Meet's caption-language picker
 * and select the language configured in AI Meet's settings. Any missing
 * element aborts silently — this must never block or break caption capture.
 */
async function trySetCaptionLanguage(languageCode) {
  const wantedNames = LANGUAGE_DISPLAY_NAMES[languageCode];
  if (!wantedNames) return;

  try {
    await sleep(600);
    const languageBtn = findButtonByLabelKeywords(CAPTION_LANGUAGE_KEYWORDS);
    if (!languageBtn) return;
    languageBtn.click();

    await sleep(400);
    const menu = document.querySelector('[role="listbox"], [role="menu"]');
    if (!menu) return;
    const options = Array.from(menu.querySelectorAll('[role="option"], [role="menuitemradio"], [role="menuitem"]'));
    const match = options.find((opt) => wantedNames.some((name) => opt.textContent.trim().includes(name)));
    if (!match) return;
    match.click();

    await sleep(300);
    const applyBtn = findButtonByLabelKeywords(['apply', 'اعمال']);
    applyBtn?.click();
  } catch {
    // Silently ignored: this feature is best-effort only.
  }
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

    enableCaptions();
    if (settings.languageMode === 'manual') {
      trySetCaptionLanguage(settings.defaultLanguage);
    }

    this.attachObserver();
  }

  async stop() {
    if (!this.isRecording) return;
    this.observer?.disconnect();
    this.rootObserver?.disconnect();
    this.isRecording = false;
    this.currentSegmentId = null;
    this.updateBadge();
    disableCaptions();
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

    const detectedSpeaker = findSpeakerForLine(container, lastEl);
    const speaker = detectedSpeaker || this.lastSpeaker;

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
    this.badgeEl.addEventListener('click', () => {
      if (!this.isRecording) {
        chrome.runtime.sendMessage({ type: 'sidepanel:open' }).catch(() => {});
      }
      this.toggle();
    });
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
