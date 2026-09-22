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

/** `type`: presentation | discussion | task-assignment | status-report. `tone`: formal | informal | critical. */
export class MeetingSection {
  constructor({ title, content, type = null, tone = null } = {}) {
    this.title = title;
    this.content = content;
    this.type = type;
    this.tone = tone;
  }
}

export class SentimentEntry {
  constructor({ speaker, sentiment = 'خنثی', note = '' } = {}) {
    this.speaker = speaker;
    this.sentiment = sentiment;
    this.note = note;
  }
}

export class TensionMoment {
  constructor({ context = '', description = '' } = {}) {
    this.context = context;
    this.description = description;
  }
}

export class GlossaryTerm {
  constructor({ term, definition } = {}) {
    this.term = term;
    this.definition = definition;
  }
}

export class KeyTopic {
  constructor({ topic, count = 1 } = {}) {
    this.topic = topic;
    this.count = count;
  }
}

export class NamedEntities {
  constructor({ people = [], organizations = [], projects = [], dates = [], locations = [] } = {}) {
    this.people = people;
    this.organizations = organizations;
    this.projects = projects;
    this.dates = dates;
    this.locations = locations;
  }
}

export class ConversationPatterns {
  constructor({ mostQuestionsBy = null, mostDecisionsBy = null, notes = '' } = {}) {
    this.mostQuestionsBy = mostQuestionsBy;
    this.mostDecisionsBy = mostDecisionsBy;
    this.notes = notes;
  }
}

export class EffectivenessScore {
  constructor({
    score = null,
    decisionSpeed = null,
    actionClarity = null,
    timeEfficiency = null,
    participationBalance = null,
    summary = ''
  } = {}) {
    this.score = score;
    this.decisionSpeed = decisionSpeed;
    this.actionClarity = actionClarity;
    this.timeEfficiency = timeEfficiency;
    this.participationBalance = participationBalance;
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
    keyTopics = [],
    sentimentBySpeaker = [],
    tensionMoments = [],
    namedEntities = {},
    glossary = [],
    conversationPatterns = {},
    agreements = [],
    disagreements = [],
    suggestedAgenda = [],
    effectivenessScore = {},
    templateId = 'general-technical',
    providerId = null
  } = {}) {
    this.executiveSummary = executiveSummary;
    this.sections = sections.map((s) => new MeetingSection(s));
    this.keyDecisions = keyDecisions;
    this.actionItems = actionItems.map((a) => new ActionItem(a));
    this.openQuestions = openQuestions;
    this.risks = risks;
    this.keyTopics = keyTopics.map((t) => (typeof t === 'string' ? new KeyTopic({ topic: t }) : new KeyTopic(t)));
    this.sentimentBySpeaker = sentimentBySpeaker.map((s) => new SentimentEntry(s));
    this.tensionMoments = tensionMoments.map((t) => new TensionMoment(t));
    this.namedEntities = new NamedEntities(namedEntities);
    this.glossary = glossary.map((g) => new GlossaryTerm(g));
    this.conversationPatterns = new ConversationPatterns(conversationPatterns);
    this.agreements = agreements;
    this.disagreements = disagreements;
    this.suggestedAgenda = suggestedAgenda;
    this.effectivenessScore = new EffectivenessScore(effectivenessScore);
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
