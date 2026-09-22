/**
 * Plain data model classes shared by the content script, background worker and UI.
 * Kept dependency-free so they survive structured-clone / JSON round-trips
 * through chrome.runtime messaging and IndexedDB without extra mapping code.
 */

export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export class TranscriptSegment {
  constructor({ id, speaker, text, timestampMs, language = 'fa' } = {}) {
    this.id = id ?? crypto.randomUUID();
    this.speaker = speaker || 'ناشناس';
    this.text = text;
    this.timestampMs = timestampMs ?? Date.now();
    this.language = language;
  }
}

export class ActionItem {
  constructor({ description, owner = null, dueDate = null, done = false } = {}) {
    this.id = crypto.randomUUID();
    this.description = description;
    this.owner = owner;
    this.dueDate = dueDate;
    this.done = done;
  }
}

export class MeetingSection {
  constructor({ title, content } = {}) {
    this.title = title;
    this.content = content;
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
    providerId = null
  } = {}) {
    this.executiveSummary = executiveSummary;
    this.sections = sections.map((s) => new MeetingSection(s));
    this.keyDecisions = keyDecisions;
    this.actionItems = actionItems.map((a) => new ActionItem(a));
    this.openQuestions = openQuestions;
    this.risks = risks;
    this.templateId = templateId;
    this.providerId = providerId;
    this.generatedAt = new Date().toISOString();
  }
}

export const MeetingStatus = Object.freeze({
  RECORDING: 'recording',
  ENDED: 'ended',
  SUMMARIZING: 'summarizing',
  SUMMARIZED: 'summarized',
  FAILED: 'failed'
});

export class Meeting {
  constructor({
    id,
    title,
    meetUrl = '',
    startedAt,
    endedAt = null,
    language = 'fa',
    status = MeetingStatus.RECORDING,
    segments = [],
    report = null,
    syncedToGithub = false,
    tags = []
  } = {}) {
    this.id = id ?? crypto.randomUUID();
    this.title = title || 'جلسه بدون عنوان';
    this.meetUrl = meetUrl;
    this.startedAt = startedAt || new Date().toISOString();
    this.endedAt = endedAt;
    this.language = language;
    this.status = status;
    this.segments = segments.map((s) => (s instanceof TranscriptSegment ? s : new TranscriptSegment(s)));
    this.report = report ? (report instanceof MeetingReport ? report : new MeetingReport(report)) : null;
    this.syncedToGithub = syncedToGithub;
    this.tags = tags;
  }

  get plainTranscript() {
    return this.segments
      .map((s) => `[${formatTime(s.timestampMs - new Date(this.startedAt).getTime())}] ${s.speaker}: ${s.text}`)
      .join('\n');
  }

  get durationMs() {
    if (!this.endedAt) return Date.now() - new Date(this.startedAt).getTime();
    return new Date(this.endedAt).getTime() - new Date(this.startedAt).getTime();
  }

  /**
   * Estimates each speaker's share of the conversation using the character
   * count of their finalized caption lines as a proxy for speaking amount
   * (captions carry no reliable per-utterance duration, only timestamps of
   * when each line was last updated).
   * @returns {{speaker: string, chars: number, percentage: number}[]} sorted descending by share
   */
  get speakerParticipation() {
    const totals = new Map();
    let grandTotal = 0;
    for (const segment of this.segments) {
      const length = (segment.text || '').trim().length;
      if (length === 0) continue;
      totals.set(segment.speaker, (totals.get(segment.speaker) || 0) + length);
      grandTotal += length;
    }
    return Array.from(totals.entries())
      .map(([speaker, chars]) => ({
        speaker,
        chars,
        percentage: grandTotal > 0 ? Math.round((chars / grandTotal) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.chars - a.chars);
  }
}
