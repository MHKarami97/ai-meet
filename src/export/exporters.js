import { MeetingReportMarkdownBuilder } from './markdown-builder.js';

/**
 * قرارداد Strategy برای خروجی‌گیری. هر Exporter یک Blob و نام فایل پیشنهادی برمی‌گرداند.
 */
export class BaseExporter {
  // eslint-disable-next-line no-unused-vars
  export(meeting) {
    throw new Error('export() must be implemented by subclass');
  }

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export class TxtExporter extends BaseExporter {
  export(meeting) {
    const blob = new Blob([meeting.toPlainText()], { type: 'text/plain;charset=utf-8' });
    this.download(blob, `${this.#safeName(meeting)}.txt`);
  }

  #safeName(meeting) {
    return meeting.title.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60);
  }
}

export class MarkdownExporter extends BaseExporter {
  export(meeting) {
    const markdown = new MeetingReportMarkdownBuilder(meeting).build();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    this.download(blob, `${this.#safeName(meeting)}.md`);
  }

  #safeName(meeting) {
    return meeting.title.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60);
  }
}

/**
 * خروجی Word با تکنیک استاندارد و مرسوم «HTML با پسوند فضای نام Word»:
 * یک فایل HTML با namespace های mso در قالب .doc ذخیره می‌شود که Microsoft Word مستقیم باز می‌کند.
 * این روش نیازی به کتابخانه docx.js یا بارگذاری خارجی ندارد و کاملاً با CSP افزونه سازگار است.
 */
export class WordExporter extends BaseExporter {
  export(meeting) {
    const html = this.#buildHtml(meeting);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    this.download(blob, `${this.#safeName(meeting)}.doc`);
  }

  #buildHtml(meeting) {
    const r = meeting.report;
    const decisions = (r?.keyDecisions || []).map((d) => `<li>${this.#esc(d)}</li>`).join('');
    const actions = (r?.actionItems || [])
      .map((a) => `<li>${this.#esc(a.description)} (مسئول: ${this.#esc(a.owner || 'نامشخص')})</li>`)
      .join('');
    const questions = (r?.openQuestions || []).map((q) => `<li>${this.#esc(q)}</li>`).join('');
    const risks = (r?.risks || []).map((rk) => `<li>${this.#esc(rk)}</li>`).join('');
    const segments = meeting.segments
      .map((s) => `<p><b>${this.#esc(s.speaker)}:</b> ${this.#esc(s.text)}</p>`)
      .join('');

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${this.#esc(meeting.title)}</title></head>
<body dir="rtl" style="font-family:'Vazirmatn', Tahoma, sans-serif;">
<h1>${this.#esc(meeting.title)}</h1>
<h2>خلاصه اجرایی</h2><p>${this.#esc(r?.executiveSummary || '')}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>سوالات باز</h2><ul>${questions}</ul>
<h2>ریسک‌ها</h2><ul>${risks}</ul>
<h2>متن کامل رونوشت</h2>${segments}
</body></html>`;
  }

  #esc(str = '') {
    return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  #safeName(meeting) {
    return meeting.title.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60);
  }
}

/**
 * خروجی PDF بدون هیچ کتابخانه خارجی: یک تب قابل چاپ باز می‌کند و از window.print()
 * برای ذخیره‌سازی به‌عنوان PDF استفاده می‌کند (قابلیت Save as PDF داخلی مرورگر).
 */
export class PdfExporter extends BaseExporter {
  export(meeting) {
    const html = new WordExporter().export === undefined ? '' : this.#buildPrintableHtml(meeting);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  #buildPrintableHtml(meeting) {
    const r = meeting.report;
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap">
<style>body{font-family:'Vazirmatn',Tahoma,sans-serif;padding:32px;line-height:1.8;} h1{color:#4c1d95;} h2{color:#2563eb;border-bottom:1px solid #eee;padding-bottom:4px;}</style>
<title>${meeting.title}</title></head><body>
<h1>${meeting.title}</h1>
<h2>خلاصه اجرایی</h2><p>${r?.executiveSummary || ''}</p>
<h2>تصمیمات</h2><ul>${(r?.keyDecisions || []).map((d) => `<li>${d}</li>`).join('')}</ul>
<h2>اقدامات</h2><ul>${(r?.actionItems || []).map((a) => `<li>${a.description}</li>`).join('')}</ul>
<h2>متن کامل</h2><div>${meeting.segments.map((s) => `<p><b>${s.speaker}:</b> ${s.text}</p>`).join('')}</div>
</body></html>`;
  }
}

export const exporters = {
  txt: new TxtExporter(),
  md: new MarkdownExporter(),
  doc: new WordExporter(),
  pdf: new PdfExporter(),
};
