import { formatTime } from '../db/models.js';

/** Builder Pattern: assembles the final Persian Markdown report for a meeting. */
export class MeetingReportMarkdownBuilder {
  constructor(meeting) {
    this.meeting = meeting;
  }

  build() {
    const meeting = this.meeting;
    const parts = [];

    parts.push(`# ${meeting.title}`);
    parts.push('');
    parts.push(`- تاریخ: ${new Date(meeting.startedAt).toLocaleString('fa-IR')}`);
    parts.push(`- مدت جلسه: ${formatTime(meeting.durationMs)}`);
    parts.push(`- زبان: ${meeting.language}`);
    parts.push('');

    const participation = meeting.speakerParticipation;
    if (participation.length > 0) {
      parts.push('## درصد مشارکت افراد');
      participation.forEach((p) => parts.push(`- ${p.speaker}: ${p.percentage}%`));
      parts.push('');
    }

    if (meeting.report) {
      const r = meeting.report;

      if (r.effectivenessScore?.score !== null && r.effectivenessScore?.score !== undefined) {
        const e = r.effectivenessScore;
        parts.push(`## امتیاز اثربخشی جلسه: ${e.score}/100`);
        parts.push(e.summary || '');
        parts.push(`- سرعت تصمیم‌گیری: ${e.decisionSpeed ?? '-'}`);
        parts.push(`- وضوح اکشن‌آیتم‌ها: ${e.actionClarity ?? '-'}`);
        parts.push(`- بهره‌وری زمانی: ${e.timeEfficiency ?? '-'}`);
        parts.push(`- توازن مشارکت: ${e.participationBalance ?? '-'}`);
        parts.push('');
      }

      parts.push('## خلاصه اجرایی');
      parts.push(r.executiveSummary || '-');
      parts.push('');

      if (r.sections?.length) {
        for (const section of r.sections) {
          const tags = [section.type, section.tone].filter(Boolean).join(' / ');
          parts.push(`### ${section.title}${tags ? ` (${tags})` : ''}`);
          parts.push(section.content);
          parts.push('');
        }
      }

      parts.push('## تصمیمات');
      (r.keyDecisions || []).forEach((d) => parts.push(`- ${d}`));
      parts.push('');

      parts.push('## اقدامات');
      (r.actionItems || []).forEach((a) => parts.push(`- [ ] ${a.description} (مسئول: ${a.owner || 'نامشخص'} | موعد: ${a.dueDate || 'نامشخص'})`));
      parts.push('');

      parts.push('## سوالات باز');
      (r.openQuestions || []).forEach((q) => parts.push(`- ${q}`));
      parts.push('');

      parts.push('## ریسک‌ها و نکات مهم');
      (r.risks || []).forEach((rk) => parts.push(`- ${rk}`));
      parts.push('');

      if (r.keyTopics?.length) {
        parts.push('## موضوعات کلیدی');
        r.keyTopics.forEach((t) => parts.push(`- ${t.topic}${t.count ? ` (${t.count} بار)` : ''}`));
        parts.push('');
      }

      if (r.sentimentBySpeaker?.length) {
        parts.push('## تحلیل احساسات به‌تفکیک گوینده');
        r.sentimentBySpeaker.forEach((s) => parts.push(`- ${s.speaker}: ${s.sentiment}${s.note ? ` — ${s.note}` : ''}`));
        parts.push('');
      }

      if (r.tensionMoments?.length) {
        parts.push('## نقاط تنش‌دار جلسه');
        r.tensionMoments.forEach((t) => parts.push(`- ${t.context}: ${t.description}`));
        parts.push('');
      }

      const ne = r.namedEntities;
      if (ne && (ne.people?.length || ne.organizations?.length || ne.projects?.length || ne.dates?.length || ne.locations?.length)) {
        parts.push('## نهادهای نام‌دار (NER)');
        if (ne.people?.length) parts.push(`- افراد: ${ne.people.join('، ')}`);
        if (ne.organizations?.length) parts.push(`- شرکت‌ها/تیم‌ها: ${ne.organizations.join('، ')}`);
        if (ne.projects?.length) parts.push(`- پروژه‌ها: ${ne.projects.join('، ')}`);
        if (ne.dates?.length) parts.push(`- تاریخ‌ها: ${ne.dates.join('، ')}`);
        if (ne.locations?.length) parts.push(`- مکان‌ها: ${ne.locations.join('، ')}`);
        parts.push('');
      }

      if (r.glossary?.length) {
        parts.push('## واژه‌نامه اصطلاحات تخصصی');
        r.glossary.forEach((g) => parts.push(`- **${g.term}**: ${g.definition}`));
        parts.push('');
      }

      if (r.conversationPatterns && (r.conversationPatterns.mostQuestionsBy || r.conversationPatterns.mostDecisionsBy)) {
        parts.push('## الگوی مکالمه');
        if (r.conversationPatterns.mostQuestionsBy) parts.push(`- بیشترین سوال‌پرسنده: ${r.conversationPatterns.mostQuestionsBy}`);
        if (r.conversationPatterns.mostDecisionsBy) parts.push(`- بیشترین تصمیم‌گیرنده: ${r.conversationPatterns.mostDecisionsBy}`);
        if (r.conversationPatterns.notes) parts.push(`- ${r.conversationPatterns.notes}`);
        parts.push('');
      }

      if (r.agreements?.length || r.disagreements?.length) {
        parts.push('## نقاط توافق و اختلاف‌نظر');
        (r.agreements || []).forEach((a) => parts.push(`- ✅ توافق: ${a}`));
        (r.disagreements || []).forEach((d) => parts.push(`- ⚠️ اختلاف‌نظر: ${d}`));
        parts.push('');
      }

      if (r.suggestedAgenda?.length) {
        parts.push('## پیشنهاد دستور جلسه بعدی');
        r.suggestedAgenda.forEach((item) => parts.push(`- ${item}`));
        parts.push('');
      }
    }

    parts.push('## متن کامل جلسه');
    parts.push('```');
    parts.push(meeting.plainTranscript);
    parts.push('```');
    parts.push('');
    parts.push('---');
    parts.push('ساخته‌شده با AI Meet — mhkarami97.ir');

    return parts.join('\n');
  }
}
