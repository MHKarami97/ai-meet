const CAPTION_CONTAINER_SELECTORS = [
  '[jsname="tgaKEf"]',
  '[jscontroller="KPn5nb"]',
  'div[aria-label="Captions"]',
  'div[aria-label*="caption" i]',
];
const PERSIAN_RANGE = /[\u0600-\u06FF]/;
const NON_CAPTION_TEXT_BLOCKLIST = [
  "jump to bottom",
  "پرش به پایین",
  "پرش به انتها",
  "turn on captions",
  "turn off captions",
];
const CAPTION_TOGGLE_KEYWORDS = ["caption", "زیرنویس"];
const CAPTION_LANGUAGE_KEYWORDS = ["caption language", "زبان زیرنویس"];
const LANGUAGE_DISPLAY_NAMES = {
  fa: ["فارسی", "Persian", "Farsi"],
  en: ["English"],
  ar: ["العربية", "Arabic"],
};

const CONTINUATION_GAP_MS = 7000;

const BADGE_TEXT = {
  fa: {
    stopped: "AI Meet - برای شروع ضبط کلیک کنید",
    recording: "AI Meet در حال ضبط - کلیک برای پایان",
  },
  en: {
    stopped: "AI Meet - Click to start recording",
    recording: "AI Meet recording - Click to stop",
  },
};

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
  const leaves = Array.from(block.querySelectorAll("div, span")).filter(
    isRealCaptionLine,
  );
  const nameEl = leaves.find(
    (el) => el !== lineEl && el.textContent.trim() !== lineText,
  );
  return nameEl?.textContent?.trim() || null;
}

function isCaptionsPanelVisible() {
  return CAPTION_CONTAINER_SELECTORS.some((sel) => document.querySelector(sel));
}

function findButtonByLabelKeywords(keywords) {
  const buttons = Array.from(document.querySelectorAll("button[aria-label]"));
  return buttons.find((b) => {
    const label = b.getAttribute("aria-label").toLowerCase();
    return keywords.some((k) => label.includes(k.toLowerCase()));
  });
}

function findCaptionToggleButton() {
  const buttons = Array.from(document.querySelectorAll("button[aria-label]"));

  const exactMatch = buttons.find((b) => {
    const label = b.getAttribute("aria-label").toLowerCase();
    return (
      label === "captions" ||
      label === "turn on captions" ||
      label === "turn off captions" ||
      label === "زیرنویس" ||
      label === "فعال کردن زیرنویس" ||
      label === "خاموش کردن زیرنویس"
    );
  });

  if (exactMatch) return exactMatch;

  return buttons.find((b) => {
    const label = b.getAttribute("aria-label").toLowerCase();
    return (
      label.includes("caption") &&
      !label.includes("settings") &&
      !label.includes("language") &&
      !label.includes("option")
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enableCaptions() {
  if (isCaptionsPanelVisible()) return true;
  const btn = findCaptionToggleButton();
  if (!btn) return false;
  btn.click();
  return true;
}

function disableCaptions() {
  if (!isCaptionsPanelVisible()) return;
  const btn = findCaptionToggleButton();
  if (btn) btn.click();
}

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
    const options = Array.from(
      menu.querySelectorAll(
        '[role="option"], [role="menuitemradio"], [role="menuitem"]',
      ),
    );
    const match = options.find((opt) =>
      wantedNames.some((name) => opt.textContent.trim().includes(name)),
    );
    if (!match) return;
    match.click();

    await sleep(300);
    const applyBtn = findButtonByLabelKeywords(["apply", "اعمال"]);
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
    this.lastLineText = "";
    this.lastSpeaker = "ناشناس";
    this.currentSegmentId = null;
    this.lastUpdateAt = 0;
    this.badgeEl = null;
    this.isRecording = false;
    this.hideCaptionsUi = false;
    this.hiddenCaptionContainer = null;
    this.hiddenCaptionOriginalDisplay = "";
    this.uiLanguage = "fa";
  }

  async init() {
    this.uiLanguage = await this.getUiLanguage();
    this.watchUiLanguageChanges();
    this.renderBadge();
  }

  /** Reads settings.uiLanguage directly — no ES import (see file header). */
  async getUiLanguage() {
    const stored = await chrome.storage.local.get("settings");
    const lang = stored.settings?.uiLanguage;
    return BADGE_TEXT[lang] ? lang : "fa";
  }

  /** Keeps the floating badge's language in sync if changed from the options page while this Meet tab stays open. */
  watchUiLanguageChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const newLang = changes.settings.newValue?.uiLanguage;
      const oldLang = changes.settings.oldValue?.uiLanguage;
      if (newLang && newLang !== oldLang && BADGE_TEXT[newLang]) {
        this.uiLanguage = newLang;
        this.updateBadge();
      }
    });
  }

  async start() {
    if (this.isRecording) return;
    const settings = await this.getSettings();
    const meeting = await this.sendMessage("meeting:start", {
      meetUrl: location.href,
      language:
        settings.languageMode === "manual" ? settings.defaultLanguage : "auto",
    });
    this.meetingId = meeting.id;
    this.isRecording = true;
    this.lastLineText = "";
    this.currentSegmentId = null;
    this.lastUpdateAt = 0;
    this.hideCaptionsUi = settings.hideCaptionsUi === true;
    this.updateBadge();

    enableCaptions();
    if (settings.languageMode === "manual") {
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
    this.restoreCaptionsUiVisibility();
    disableCaptions();
    if (this.meetingId)
      await this.sendMessage("meeting:end", { meetingId: this.meetingId });
  }

  toggle() {
    if (this.isRecording) this.stop();
    else this.start();
  }

  attachObserver() {
    const tryAttach = () => {
      const container = CAPTION_CONTAINER_SELECTORS.map((sel) =>
        document.querySelector(sel),
      ).find(Boolean);
      if (!container) return false;

      this.applyCaptionsUiVisibility(container);

      this.observer = new MutationObserver(() =>
        this.onCaptionsMutated(container),
      );
      this.observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      return true;
    };

    if (tryAttach()) return;

    this.rootObserver = new MutationObserver(() => {
      if (tryAttach()) this.rootObserver.disconnect();
    });
    this.rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  applyCaptionsUiVisibility(container) {
    if (!this.hideCaptionsUi || !container) return;
    this.hiddenCaptionContainer = container;

    this.hiddenCaptionOriginalDisplay = container.style.display || "";
    this.hiddenCaptionOriginalPosition = container.style.position || "";
    this.hiddenCaptionOriginalZIndex = container.style.zIndex || "";
    this.hiddenCaptionOriginalOpacity = container.style.opacity || "";
    this.hiddenCaptionOriginalPointerEvents =
      container.style.pointerEvents || "";

    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    container.style.position = "fixed";
    container.style.zIndex = "-1";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "1px";
    container.style.height = "1px";
    container.style.overflow = "hidden";
  }

  restoreCaptionsUiVisibility() {
    if (this.hiddenCaptionContainer) {
      const container = this.hiddenCaptionContainer;
      container.style.opacity = this.hiddenCaptionOriginalOpacity || "";
      container.style.pointerEvents =
        this.hiddenCaptionOriginalPointerEvents || "";
      container.style.position = this.hiddenCaptionOriginalPosition || "";
      container.style.zIndex = this.hiddenCaptionOriginalZIndex || "";
      container.style.top = "";
      container.style.left = "";
      container.style.width = "";
      container.style.height = "";
      container.style.overflow = "";
      container.style.display = this.hiddenCaptionOriginalDisplay || "";
      this.hiddenCaptionContainer = null;
    }
  }

  onCaptionsMutated(container) {
    if (!this.isRecording) return;
    const lines = Array.from(container.querySelectorAll("div, span")).filter(
      isRealCaptionLine,
    );
    if (lines.length === 0) return;

    const lastEl = lines[lines.length - 1];
    const text = lastEl.textContent.trim();
    if (!text || text === this.lastLineText) return;

    const detectedSpeaker = findSpeakerForLine(container, lastEl);
    const speaker = detectedSpeaker || this.lastSpeaker;
    const now = Date.now();

    const isContinuation =
      this.currentSegmentId !== null &&
      speaker === this.lastSpeaker &&
      now - this.lastUpdateAt < CONTINUATION_GAP_MS;

    if (!isContinuation) {
      this.currentSegmentId = createSegmentId();
    }

    this.lastLineText = text;
    this.lastSpeaker = speaker;
    this.lastUpdateAt = now;

    const language = PERSIAN_RANGE.test(text) ? "fa" : "en";
    this.sendMessage("meeting:segment", {
      meetingId: this.meetingId,
      segment: {
        id: this.currentSegmentId,
        speaker,
        text,
        timestampMs: now,
        language,
      },
    });
  }

  renderBadge() {
    this.badgeEl = document.createElement("button");
    this.badgeEl.type = "button";
    this.badgeEl.className = "ai-meet-badge stopped";
    this.badgeEl.innerHTML = BADGE_TEXT[this.uiLanguage].stopped;
    this.badgeEl.addEventListener("click", () => {
      if (!this.isRecording) {
        chrome.runtime.sendMessage({ type: "sidepanel:open" }).catch(() => {});
      }
      this.toggle();
    });
    document.body.appendChild(this.badgeEl);
    window.addEventListener("beforeunload", () => this.stop());
  }

  updateBadge() {
    if (!this.badgeEl) return;
    this.badgeEl.classList.toggle("stopped", !this.isRecording);
    this.badgeEl.innerHTML = this.isRecording
      ? BADGE_TEXT[this.uiLanguage].recording
      : BADGE_TEXT[this.uiLanguage].stopped;
  }

  async getSettings() {
    const stored = await chrome.storage.local.get("settings");
    return (
      stored.settings || {
        languageMode: "auto",
        defaultLanguage: "fa",
        hideCaptionsUi: false,
      }
    );
  }

  sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
}

const capture = new MeetCaptionCapture();

function waitForMeetingUiThenInit() {
  const readyCheck = setInterval(() => {
    const inMeeting = document.querySelector(
      '[data-meeting-title], [jsname="HlFzId"]',
    );
    if (inMeeting) {
      clearInterval(readyCheck);
      capture.init();
    }
  }, 1500);
}

waitForMeetingUiThenInit();