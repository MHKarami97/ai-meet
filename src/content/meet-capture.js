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
  var LANGUAGE_TRIGGER_KEYWORDS = [
    "language of the meeting",
    "meeting language",
    "caption language",
    "language",
    "زبان",
  ];
  var LANGUAGE_OPTION_SELECTOR =
    '[role="option"], [role="menuitemradio"], [role="menuitem"], li[data-value]';
  var LANGUAGE_MATCH_NAMES = {
    fa: ["persian", "farsi", "فارسی", "persisch"],
    en: ["english", "انگلیسی", "englisch"],
    ar: ["arabic", "عربی", "arabisch"],
  };

  function waitFor(probe, timeoutMs, intervalMs) {
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      var timer = setInterval(function () {
        var result = probe();
        if (result || Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          resolve(result || null);
        }
      }, intervalMs);
    });
  }

  class CaptionLanguageSelector {
    constructor(languageCode) {
      this.languageCode = languageCode;
      this.names = LANGUAGE_MATCH_NAMES[languageCode] || [];
    }

    async select() {
      if (this.names.length === 0) return false;

      var panelReady = await waitFor(isCaptionsPanelVisible, 5000, 200);
      if (!panelReady) return this.fail("captions panel not visible");

      var trigger = await waitFor(() => this.findTrigger(), 4000, 200);
      if (!trigger) return this.fail("language trigger not found");
      if (this.matchesWanted(trigger)) return true;

      trigger.click();
      var option = await waitFor(() => this.findOption(), 3000, 150);
      if (!option) return this.fail("language option not found");

      option.click();
      var applyButton = await waitFor(
        () => findButtonByLabelKeywords(["apply"]),
        1500,
        150,
      );
      if (applyButton) applyButton.click();
      return true;
    }

    findTrigger() {
      var candidates = Array.from(
        document.querySelectorAll('button, [role="combobox"], [role="button"]'),
      );
      return candidates.find((el) => this.isLanguageTrigger(el)) || null;
    }

    isLanguageTrigger(el) {
      var label = (
        (el.getAttribute("aria-label") || "") +
        " " +
        (el.textContent || "")
      ).toLowerCase();
      var isToggle =
        label.includes("turn on captions") ||
        label.includes("turn off captions");
      if (isToggle) return false;
      return LANGUAGE_TRIGGER_KEYWORDS.some((keyword) =>
        label.includes(keyword),
      );
    }

    matchesWanted(el) {
      var text = (el.textContent || "").toLowerCase();
      return this.names.some((name) => text.includes(name));
    }

    findOption() {
      var options = Array.from(
        document.querySelectorAll(LANGUAGE_OPTION_SELECTOR),
      );
      return (
        options.find((opt) => {
          var dataValue = (opt.getAttribute("data-value") || "").toLowerCase();
          return (
            dataValue.startsWith(this.languageCode) || this.matchesWanted(opt)
          );
        }) || null
      );
    }

    fail(reason) {
      console.warn("[AI Meet] caption language not set:", reason);
      return false;
    }
  }
}

var LANGUAGE_TRIGGER_KEYWORDS = [
  "language of the meeting",
  "meeting language",
  "caption language",
  "language",
  "زبان",
];
var LANGUAGE_OPTION_SELECTOR =
  '[role="option"], [role="menuitemradio"], [role="menuitem"], li[data-value]';
var LANGUAGE_MATCH_NAMES = {
  fa: ["persian", "farsi", "فارسی", "persisch"],
  en: ["english", "انگلیسی", "englisch"],
  ar: ["arabic", "عربی", "arabisch"],
};

function waitFor(probe, timeoutMs, intervalMs) {
  return new Promise(function (resolve) {
    var startedAt = Date.now();
    var timer = setInterval(function () {
      var result = probe();
      if (result || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(result || null);
      }
    }, intervalMs);
  });
}

class CaptionLanguageSelector {
  constructor(languageCode) {
    this.languageCode = languageCode;
    this.names = LANGUAGE_MATCH_NAMES[languageCode] || [];
  }

  async select() {
    if (this.names.length === 0) return false;

    var panelReady = await waitFor(isCaptionsPanelVisible, 5000, 200);
    if (!panelReady) return this.fail("captions panel not visible");

    var trigger = await waitFor(() => this.findTrigger(), 4000, 200);
    if (!trigger) return this.fail("language trigger not found");
    if (this.matchesWanted(trigger)) return true;

    trigger.click();
    var option = await waitFor(() => this.findOption(), 3000, 150);
    if (!option) return this.fail("language option not found");

    option.click();
    var applyButton = await waitFor(
      () => findButtonByLabelKeywords(["apply"]),
      1500,
      150,
    );
    if (applyButton) applyButton.click();
    return true;
  }

  findTrigger() {
    var candidates = Array.from(
      document.querySelectorAll('button, [role="combobox"], [role="button"]'),
    );
    return candidates.find((el) => this.isLanguageTrigger(el)) || null;
  }

  isLanguageTrigger(el) {
    var label = (
      (el.getAttribute("aria-label") || "") +
      " " +
      (el.textContent || "")
    ).toLowerCase();
    var isToggle =
      label.includes("turn on captions") || label.includes("turn off captions");
    if (isToggle) return false;
    return LANGUAGE_TRIGGER_KEYWORDS.some((keyword) => label.includes(keyword));
  }

  matchesWanted(el) {
    var text = (el.textContent || "").toLowerCase();
    return this.names.some((name) => text.includes(name));
  }

  findOption() {
    var options = Array.from(
      document.querySelectorAll(LANGUAGE_OPTION_SELECTOR),
    );
    return (
      options.find((opt) => {
        var dataValue = (opt.getAttribute("data-value") || "").toLowerCase();
        return (
          dataValue.startsWith(this.languageCode) || this.matchesWanted(opt)
        );
      }) || null
    );
  }

  fail(reason) {
    console.warn("[AI Meet] caption language not set:", reason);
    return false;
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

    var settings = await this.getSettings();
    var meeting = await this.sendMessage("meeting:start", {
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
      await new CaptionLanguageSelector(settings.defaultLanguage).select();
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
        languageMode: "manual",
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
