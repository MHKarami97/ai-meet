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

var PAUSE_BUTTON_TEXT = {
  fa: { pause: "توقف موقت", resume: "ادامه ضبط" },
  en: { pause: "Pause", resume: "Resume" },
};

const CONTINUATION_GAP_MS = 7000;

const BADGE_TEXT = {
  fa: {
    stopped: "AI Meet (برای شروع ضبط کلیک کنید)",
    recording: "پایان ضبط",
    paused: '<span class="dot"></span> پایان ضبط',
  },
  en: {
    stopped: "AI Meet (Click to start recording)",
    recording: "Stop Recording",
    paused: '<span class="dot"></span> Stop Recording',
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

function findCaptionContainer() {
  return (
    CAPTION_CONTAINER_SELECTORS.map((selector) =>
      document.querySelector(selector),
    ).find(Boolean) || null
  );
}

function readLastCaptionText() {
  var container = findCaptionContainer();
  if (!container) return "";
  var lines = Array.from(container.querySelectorAll("div, span")).filter(
    isRealCaptionLine,
  );
  return lines.length > 0 ? lines[lines.length - 1].textContent.trim() : "";
}

class MeetCaptionCapture {
  constructor() {
    this.meetingId = null;
    this.observer = null;
    this.rootObserver = null;
    this.observedContainer = null;
    this.syncScheduled = false;
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
    this.isPaused = false;
    this.resumeBaseline = "";
    this.dockEl = null;
    this.pauseBtnEl = null;
    this.mainEl = null;
    this.mainObserver = null;
    this.mainOriginalInset = null;
    this.mainGoogleInset = null;
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
    this.isPaused = false;
    this.resumeBaseline = "";
    this.lastLineText = "";
    this.currentSegmentId = null;
    this.lastUpdateAt = 0;
    this.hideCaptionsUi = settings.hideCaptionsUi === true;
    this.updateBadge();

    this.rememberMainLayout();
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
    this.observer = null;
    this.rootObserver = null;
    this.observedContainer = null;
    this.isRecording = false;
    this.isPaused = false;
    this.resumeBaseline = "";
    this.currentSegmentId = null;
    this.updateBadge();
    this.restoreCaptionsUiVisibility();
    disableCaptions();
    if (this.meetingId) {
      try {
        await this.sendMessage("meeting:end", { meetingId: this.meetingId });
      } catch (e) {}
    }
  }

  findMainBox() {
    return document.querySelector('main[jscontroller="izfDQc"]') || null;
  }

  toggle() {
    if (this.isRecording) this.stop();
    else this.start();
  }

  togglePause() {
    if (this.isPaused) this.resume();
    else this.pause();
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    this.currentSegmentId = null;

    this.refreshCaptionsVisibility(findCaptionContainer());

    this.updateBadge();
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    this.resumeBaseline = readLastCaptionText();
    this.lastLineText = this.resumeBaseline;
    this.currentSegmentId = null;
    this.isPaused = false;

    this.refreshCaptionsVisibility(findCaptionContainer());

    this.updateBadge();
  }

  stripResumeBaseline(text) {
    if (!this.resumeBaseline) return text;
    if (text === this.resumeBaseline) return "";
    if (text.startsWith(this.resumeBaseline)) {
      return text.slice(this.resumeBaseline.length).trim();
    }
    this.resumeBaseline = "";
    return text;
  }

  attachObserver() {
    this.syncObserver();

    this.rootObserver?.disconnect();
    this.rootObserver = new MutationObserver(() => this.scheduleObserverSync());
    this.rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  scheduleObserverSync() {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    requestAnimationFrame(() => {
      this.syncScheduled = false;
      if (this.isRecording) this.syncObserver();
    });
  }

  syncObserver() {
    var container = findCaptionContainer();
    if (container === this.observedContainer) return;

    this.observer?.disconnect();
    this.observer = null;
    this.observedContainer = container;
    if (!container) return;

    this.refreshCaptionsVisibility(container);

    var currentText = readLastCaptionText();
    if (
      currentText &&
      this.lastLineText &&
      currentText.startsWith(this.lastLineText)
    ) {
      this.resumeBaseline = this.lastLineText;
    }

    this.observer = new MutationObserver(() =>
      this.onCaptionsMutated(container),
    );
    this.observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  findCaptionBox() {
    return (
      Array.from(
        document.querySelectorAll('div[data-side="3"][data-priority="999"]'),
      ).find((el) => {
        const style = el.getAttribute("style") || "";
        const hasBottom80 = /bottom\s*:\s*80px/.test(style);
        const hasCaptionChild =
          el.querySelector(".a4cQT") ||
          el.querySelector('[aria-label*="caption" i]') ||
          el.querySelector('[aria-label="Captions"]');
        return hasBottom80 && hasCaptionChild;
      }) || null
    );
  }

  shouldHideCaptions() {
    return this.hideCaptionsUi || this.isPaused;
  }

  refreshCaptionsVisibility(container) {
    if (this.shouldHideCaptions()) this.applyCaptionsUiVisibility(container);
    else this.restoreCaptionsUiVisibility();
  }

  applyCaptionsUiVisibility(container) {
    const box = this.findCaptionBox() || container;

    if (box && box !== this.hiddenCaptionContainer) {
      this.restoreCaptionBox();
      this.hiddenCaptionContainer = box;

      this.hiddenCaptionOriginalDisplay = box.style.display || "";
      this.hiddenCaptionOriginalPosition = box.style.position || "";
      this.hiddenCaptionOriginalZIndex = box.style.zIndex || "";
      this.hiddenCaptionOriginalOpacity = box.style.opacity || "";
      this.hiddenCaptionOriginalPointerEvents = box.style.pointerEvents || "";

      box.style.opacity = "0";
      box.style.pointerEvents = "none";
      box.style.position = "fixed";
      box.style.zIndex = "-1";
      box.style.top = "0";
      box.style.left = "0";
      box.style.width = "1px";
      box.style.height = "1px";
      box.style.overflow = "hidden";
    }

    this.lockMainLayout();
  }

  restoreCaptionsUiVisibility() {
    this.restoreCaptionBox();
    this.unlockMainLayout();
  }

  restoreCaptionBox() {
    if (!this.hiddenCaptionContainer) return;
    const box = this.hiddenCaptionContainer;

    box.style.opacity = this.hiddenCaptionOriginalOpacity || "";
    box.style.pointerEvents = this.hiddenCaptionOriginalPointerEvents || "";
    box.style.position = this.hiddenCaptionOriginalPosition || "";
    box.style.zIndex = this.hiddenCaptionOriginalZIndex || "";
    box.style.top = "";
    box.style.left = "";
    box.style.width = "";
    box.style.height = "";
    box.style.overflow = "";
    box.style.display = this.hiddenCaptionOriginalDisplay || "";

    this.hiddenCaptionContainer = null;
  }

  rememberMainLayout() {
    const main = this.findMainBox();
    this.mainOriginalInset =
      main && !isCaptionsPanelVisible() ? main.style.inset : null;
  }

  lockMainLayout() {
    const main = this.findMainBox();
    if (!main || this.mainOriginalInset === null) return;

    if (this.mainEl !== main || !this.mainObserver) {
      this.mainObserver?.disconnect();
      this.mainEl = main;
      this.mainObserver = new MutationObserver(() => this.enforceMainInset());
      this.mainObserver.observe(main, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
    this.enforceMainInset();
  }

  enforceMainInset() {
    const main = this.mainEl;
    if (!main || this.mainOriginalInset === null) return;

    if (main.style.inset === this.mainOriginalInset) {
      this.mainGoogleInset = null;
      return;
    }
    this.mainGoogleInset = main.style.inset;
    main.style.inset = this.mainOriginalInset;
    this.mainObserver?.takeRecords();
  }

  unlockMainLayout() {
    this.mainObserver?.disconnect();
    this.mainObserver = null;
    if (this.mainEl && this.mainGoogleInset !== null) {
      this.mainEl.style.inset = this.mainGoogleInset;
    }
    this.mainEl = null;
    this.mainGoogleInset = null;
  }

  onCaptionsMutated(container) {
    if (!this.isRecording || this.isPaused) return;
    const lines = Array.from(container.querySelectorAll("div, span")).filter(
      isRealCaptionLine,
    );
    if (lines.length === 0) return;

    const lastEl = lines[lines.length - 1];
    var text = lastEl.textContent.trim();
    if (!text) return;

    text = this.stripResumeBaseline(text);
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
    this.dockEl = document.createElement("div");
    this.dockEl.className = "ai-meet-dock";

    this.badgeEl = document.createElement("button");
    this.badgeEl.type = "button";
    this.badgeEl.className = "ai-meet-badge stopped";
    this.badgeEl.addEventListener("click", () => {
      if (!this.isRecording) {
        chrome.runtime.sendMessage({ type: "sidepanel:open" }).catch(() => {});
      }
      this.toggle();
    });

    this.pauseBtnEl = document.createElement("button");
    this.pauseBtnEl.type = "button";
    this.pauseBtnEl.className = "ai-meet-pause";
    this.pauseBtnEl.hidden = true;
    this.pauseBtnEl.addEventListener("click", () => this.togglePause());

    this.dockEl.append(this.badgeEl, this.pauseBtnEl);
    document.body.appendChild(this.dockEl);
    window.addEventListener("beforeunload", () => this.stop());
    this.updateBadge();
  }

  updateBadge() {
    if (!this.badgeEl) return;

    var state = !this.isRecording
      ? "stopped"
      : this.isPaused
        ? "paused"
        : "recording";
    var texts = BADGE_TEXT[this.uiLanguage] || BADGE_TEXT.fa;
    var buttonTexts =
      PAUSE_BUTTON_TEXT[this.uiLanguage] || PAUSE_BUTTON_TEXT.fa;

    this.badgeEl.classList.toggle("stopped", state === "stopped");
    this.badgeEl.classList.toggle("paused", state === "paused");
    this.badgeEl.innerHTML = texts[state];

    this.pauseBtnEl.hidden = !this.isRecording;
    this.pauseBtnEl.textContent = this.isPaused
      ? buttonTexts.resume
      : buttonTexts.pause;
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
    try {
      return chrome.runtime.sendMessage({ type, payload });
    } catch (e) {
      return Promise.reject(e);
    }
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