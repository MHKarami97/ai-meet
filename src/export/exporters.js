import { MeetingReportMarkdownBuilder } from './markdown-builder.js';

function safeName(meeting) {
  return meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]/g, '').slice(0, 60) || meeting.id;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Strategy Pattern: every exporter turns a Meeting into a downloadable Blob. */
export class BaseExporter {
  // eslint-disable-next-line no-unused-vars
  export(meeting) {
    throw new Error('export() must be implemented by subclass');
  }

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export class TxtExporter extends BaseExporter {
  export(meeting) {
    const blob = new Blob([meeting.plainTranscript], { type: 'text/plain;charset=utf-8' });
    this.download(blob, `${safeName(meeting)}.txt`);
  }
}

export class MarkdownExporter extends BaseExporter {
  export(meeting) {
    const markdown = new MeetingReportMarkdownBuilder(meeting).build();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    this.download(blob, `${safeName(meeting)}.md`);
  }
}

/**
 * Produces a Word-openable file using the "HTML + MS Office XML namespaces"
 * trick (saved with a .doc extension). Avoids bundling a real OOXML/zip
 * writer while still opening cleanly in Microsoft Word / LibreOffice.
 */
export class WordExporter extends BaseExporter {
  export(meeting) {
    const html = this.buildHtml(meeting);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    this.download(blob, `${safeName(meeting)}.doc`);
  }

  buildHtml(meeting) {
    const r = meeting.report;
    const decisions = (r?.keyDecisions || []).map((d) => `<li>${escapeHtml(d)}</li>`).join('');
    const actions = (r?.actionItems || [])
      .map((a) => `<li>${escapeHtml(a.description)} — ${escapeHtml(a.owner || 'نامشخص')}</li>`)
      .join('');
    const questions = (r?.openQuestions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join('');
    const risks = (r?.risks || []).map((rk) => `<li>${escapeHtml(rk)}</li>`).join('');
    const segments = meeting.segments
      .map((s) => `<p><b>${escapeHtml(s.speaker)}:</b> ${escapeHtml(s.text)}</p>`)
      .join('');

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(meeting.title)}</title></head>
<body dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif">
<h1>${escapeHtml(meeting.title)}</h1>
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || '-')}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>سوالات باز</h2><ul>${questions}</ul>
<h2>ریسک‌ها</h2><ul>${risks}</ul>
<h2>متن کامل جلسه</h2>${segments}
</body></html>`;
  }
}

/** Uses the browser's native "Save as PDF" print pipeline — zero dependencies, fully offline. */
export class PdfExporter extends BaseExporter {
  export(meeting) {
    const html = this.buildPrintableHtml(meeting);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  buildPrintableHtml(meeting) {
    const r = meeting.report;
    const decisions = (r?.keyDecisions || []).map((d) => `<li>${escapeHtml(d)}</li>`).join('');
    const actions = (r?.actionItems || []).map((a) => `<li>${escapeHtml(a.description)}</li>`).join('');
    const segments = meeting.segments
      .map((s) => `<p><b>${escapeHtml(s.speaker)}:</b> ${escapeHtml(s.text)}</p>`)
      .join('');

    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap">
<style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:32px;line-height:1.8}
h1{color:#4c1d95}h2{color:#2563eb;border-bottom:1px solid #eee;padding-bottom:4px}</style>
<title>${escapeHtml(meeting.title)}</title></head>
<body>
<h1>${escapeHtml(meeting.title)}</h1>
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || '-')}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>متن کامل جلسه</h2><div>${segments}</div>
</body></html>`;
  }
}

export const exporters = {
  txt: new TxtExporter(),
  md: new MarkdownExporter(),
  doc: new WordExporter(),
  pdf: new PdfExporter()
};
