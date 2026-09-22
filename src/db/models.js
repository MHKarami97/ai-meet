/**
 * مدل‌های داده‌ی اصلی افزونه.
 * همه‌ی کلاس‌ها ساده و بدون وابستگی خارجی هستند تا هم در Content Script،
 * هم در Background Service Worker و هم در صفحات UI قابل استفاده باشند.
 */

export class TranscriptSegment {
  constructor({ id, speaker, text, startOffsetMs, language }) {
    this.id = id ?? crypto.randomUUID();
    this.speaker = speaker || 'ناشناس';
    this.text = text;
    this.startOffsetMs = startOffsetMs ?? 0;
    this.language = language || 'fa';
  }

  toDisplayTime() {
    const totalSeconds = Math.floor(this.startOffsetMs / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}

export class ActionItem {
  constructor({ description, owner = null, dueDate = null, done = false }) {
    this.id = crypto.randomUUID();
    this.description = description;
    this.owner = owner;
    this.dueDate = dueDate;
    this.done = done;
  }
}

export class MeetingSection {
  constructor({ title, summary }) {
    this.title = title;
    this.summary = summary;
  }
}

export class MeetingReport {
  constructor({
    executiveSummary = '',
    sections = [],
    keyDecisions = [],
    actionItems = [],
    openQuestions = [],
    risks = [],
    templateId = 'general',
  } = {}) {
    this.executiveSummary = executiveSummary;
    this.sections = sections.map((s) => (s instanceof MeetingSection ? s : new MeetingSection(s)));
    this.keyDecisions = keyDecisions;
    this.actionItems = actionItems.map((a) => (a instanceof ActionItem ? a : new ActionItem(a)));
    this.openQuestions = openQuestions;
    this.risks = risks;
    this.templateId = templateId;
    this.generatedAt = new Date().toISOString();
  }
}

/** وضعیت‌های ممکن یک جلسه در چرخه‌ی عمرش. */
export const MeetingStatus = Object.freeze({
  RECORDING: 'recording',
  ENDED: 'ended',
  SUMMARIZING: 'summarizing',
  SUMMARIZED: 'summarized',
  FAILED: 'failed',
});

export class Meeting {
  constructor({
    id,
    title,
    meetUrl,
    startedAt,
    endedAt = null,
    language = 'fa',
    status = MeetingStatus.RECORDING,
    segments = [],
    report = null,
    templateId = 'general',
    providerId = null,
    syncedToGithub = false,
    tags = [],
  }) {
    this.id = id ?? crypto.randomUUID();
    this.title = title || 'جلسه بدون عنوان';
    this.meetUrl = meetUrl || '';
    this.startedAt = startedAt || new Date().toISOString();
    this.endedAt = endedAt;
    this.language = language;
    this.status = status;
    this.segments = segments.map((s) => (s instanceof TranscriptSegment ? s : new TranscriptSegment(s)));
    this.report = report ? (report instanceof MeetingReport ? report : new MeetingReport(report)) : null;
    this.templateId = templateId;
    this.providerId = providerId;
    this.syncedToGithub = syncedToGithub;
    this.tags = tags;
  }

  get plainTranscript() {
    return this.segments
      .map((s) => `[${s.toDisplayTime()}] ${s.speaker}: ${s.text}`)
      .join('\n');
  }

  get durationLabel() {
    if (!this.endedAt) return 'در حال برگزاری';
    const ms = new Date(this.endedAt) - new Date(this.startedAt);
    const minutes = Math.round(ms / 60000);
    return `${minutes} دقیقه`;
  }
}
