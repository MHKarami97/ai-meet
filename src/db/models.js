/**
 * مدل‌های داده پروژه. تمام مدل‌ها POJO-سریالایز‌شدنی هستند تا مستقیماً داخل IndexedDB قابل ذخیره باشند.
 */

export class TranscriptSegment {
  constructor({ id, speaker, text, timestampMs, language }) {
    this.id = id;
    this.speaker = speaker || 'نامشخص';
    this.text = text;
    this.timestampMs = timestampMs;
    this.language = language || 'fa';
  }
}

export class ActionItem {
  constructor({ description, owner = null, dueDate = null, done = false }) {
    this.description = description;
    this.owner = owner;
    this.dueDate = dueDate;
    this.done = done;
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
    templateId = 'general-technical',
    providerId = null,
    generatedAt = Date.now(),
  } = {}) {
    this.executiveSummary = executiveSummary;
    this.sections = sections; // [{ title, content }]
    this.keyDecisions = keyDecisions;
    this.actionItems = actionItems.map((item) => new ActionItem(item));
    this.openQuestions = openQuestions;
    this.risks = risks;
    this.templateId = templateId;
    this.providerId = providerId;
    this.generatedAt = generatedAt;
  }
}

export class Meeting {
  constructor({
    id,
    title = 'جلسه بدون عنوان',
    startedAt = Date.now(),
    endedAt = null,
    language = 'fa',
    meetUrl = '',
    tags = [],
    segments = [],
    report = null,
    githubSynced = false,
  } = {}) {
    this.id = id;
    this.title = title;
    this.startedAt = startedAt;
    this.endedAt = endedAt;
    this.language = language;
    this.meetUrl = meetUrl;
    this.tags = tags;
    this.segments = segments.map((s) => (s instanceof TranscriptSegment ? s : new TranscriptSegment(s)));
    this.report = report ? new MeetingReport(report) : null;
    this.githubSynced = githubSynced;
  }

  get durationMs() {
    return (this.endedAt || Date.now()) - this.startedAt;
  }

  toPlainText() {
    return this.segments
      .map((s) => `[${formatTime(s.timestampMs)}] ${s.speaker}: ${s.text}`)
      .join('\n');
  }
}

export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function createId() {
  return `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
