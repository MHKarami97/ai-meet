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

    if (meeting.report) {
      const r = meeting.report;
      parts.push('## خلاصه اجرایی');
      parts.push(r.executiveSummary || '-');
      parts.push('');

      if (r.sections?.length) {
        for (const section of r.sections) {
          parts.push(`### ${section.title}`);
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
    }

    parts.push('## متن کامل جلسه');
    parts.push('```');
    parts.push(meeting.plainTranscript);
    parts.push('```');

    return parts.join('\n');
  }
}
