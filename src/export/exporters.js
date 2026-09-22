import { MeetingReportMarkdownBuilder } from './markdown-builder.js';

function safeName(meeting) {
  return meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]/g, '').slice(0, 60) || meeting.id;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function participationListHtml(meeting) {
  return meeting.speakerParticipation
    .map((p) => `<li>${escapeHtml(p.speaker)} — ${p.percentage}%</li>`)
    .join('');
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
    const participation = meeting.speakerParticipation
      .map((p) => `${p.speaker}: ${p.percentage}%`)
      .join('\n');
    const text = participation
      ? `${meeting.plainTranscript}\n\n--- درصد مشارکت افراد ---\n${participation}\n\nmhkarami97.ir`
      : meeting.plainTranscript;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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
<head><meta charset="utf-8"><title>${escapeHtml(meeting.title)} — mhkarami97.ir</title></head>
<body dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif">
<h1>${escapeHtml(meeting.title)}</h1>
<h2>درصد مشارکت افراد</h2><ul>${participationListHtml(meeting)}</ul>
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || '-')}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>سوالات باز</h2><ul>${questions}</ul>
<h2>ریسک‌ها</h2><ul>${risks}</ul>
<h2>متن کامل جلسه</h2>${segments}
<hr><p style="font-size:11px;color:#888">ساخته‌شده با AI Meet — mhkarami97.ir</p>
</body></html>`;
  }
}

/**
 * Uses the browser's native "Save as PDF" print pipeline — zero dependencies,
 * fully offline. The document is served from a Blob URL (instead of an empty
 * "about:blank" window) and given a real <title>, so the print header/footer
 * shows the site name instead of "about:blank". Note: fully removing the
 * browser's own printed header/footer (with page URL) is a setting in the
 * print dialog itself ("More settings" > uncheck "Headers and footers") —
 * a web page cannot override that from JavaScript/CSS.
 */
export class PdfExporter extends BaseExporter {
  export(meeting) {
    const html = this.buildPrintableHtml(meeting);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, '_blank');
    if (!printWindow) return;
    printWindow.addEventListener('load', () => {
      printWindow.document.title = `mhkarami97.ir — ${meeting.title}`;
      printWindow.focus();
      printWindow.print();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    });
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
<style>
body{font-family:Vazirmatn,Tahoma,sans-serif;padding:32px;line-height:1.8}
h1{color:#4c1d95}h2{color:#2563eb;border-bottom:1px solid #eee;padding-bottom:4px}
.site-footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center}
</style>
<title>mhkarami97.ir — ${escapeHtml(meeting.title)}</title></head>
<body>
<h1>${escapeHtml(meeting.title)}</h1>
<h2>درصد مشارکت افراد</h2><ul>${participationListHtml(meeting)}</ul>
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || '-')}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>متن کامل جلسه</h2><div>${segments}</div>
<div class="site-footer">ساخته‌شده با AI Meet — mhkarami97.ir</div>
</body></html>`;
  }
}

export const exporters = {
  txt: new TxtExporter(),
  md: new MarkdownExporter(),
  doc: new WordExporter(),
  pdf: new PdfExporter()
};
