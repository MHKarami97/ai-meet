import { formatTime } from '../db/models.js';

/**
 * Builder برای تولید سند Markdown از یک Meeting. همین خروجی هم مبنای فایل .md است
 * و هم مبنای سندی که در GitHub Sync و نمایش UI استفاده می‌شود.
 */
export class MeetingReportMarkdownBuilder {
  constructor(meeting) {
    this.meeting = meeting;
  }

  build() {
    const { meeting } = this;
    const parts = [];

    parts.push(`# گزارش جلسه: ${meeting.title}`);
    parts.push('');
    parts.push(`- تاریخ: ${new Date(meeting.startedAt).toLocaleString('fa-IR')}`);
    parts.push(`- مدت: ${formatTime(meeting.durationMs)}`);
    parts.push(`- زبان: ${meeting.language}`);
    parts.push('');

    if (meeting.report) {
      const r = meeting.report;
      parts.push('## خلاصه اجرایی', r.executiveSummary, '');

      if (r.sections?.length) {
        for (const section of r.sections) {
          parts.push(`## ${section.title}`, section.content, '');
        }
      }

      parts.push('## تصمیمات');
      (r.keyDecisions || []).forEach((d) => parts.push(`- ${d}`));
      parts.push('');

      parts.push('## اقدامات');
      (r.actionItems || []).forEach((a) =>
        parts.push(`- [ ] ${a.description} (مسئول: ${a.owner || 'نامشخص'}، موعد: ${a.dueDate || 'نامشخص'})`)
      );
      parts.push('');

      parts.push('## سوالات باز');
      (r.openQuestions || []).forEach((q) => parts.push(`- ${q}`));
      parts.push('');

      parts.push('## ریسک‌ها و نکات مهم');
      (r.risks || []).forEach((rk) => parts.push(`- ${rk}`));
      parts.push('');
    }

    parts.push('## متن کامل رونوشت');
    parts.push('```');
    parts.push(meeting.toPlainText());
    parts.push('```');

    return parts.join('\n');
  }
}
