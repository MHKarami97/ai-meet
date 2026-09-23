import { MeetingReportMarkdownBuilder } from "./markdown-builder.js";
import { settingsStore } from "../background/settings-store.js";

function safeName(meeting) {
  return (
    meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]/g, "").slice(0, 60) ||
    meeting.id
  );
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}

function participationListHtml(meeting) {
  return meeting.speakerParticipation
    .map((p) => `<li>${escapeHtml(p.speaker)} - ${p.percentage}%</li>`)
    .join("");
}

function extendedAnalysisHtml(meeting) {
  const r = meeting.report;
  if (!r) return "";
  const parts = [];

  const e = r.effectivenessScore;
  if (e?.score !== null && e?.score !== undefined) {
    parts.push(`<h2>امتیاز اثربخشی جلسه</h2><p><b>${escapeHtml(String(e.score))}/100</b></p><p>${escapeHtml(e.summary || "")}</p><ul>
      <li>سرعت تصمیم‌گیری: ${escapeHtml(String(e.decisionSpeed ?? "-"))}</li>
      <li>وضوح اکشن‌آیتم‌ها: ${escapeHtml(String(e.actionClarity ?? "-"))}</li>
      <li>بهره‌وری زمانی: ${escapeHtml(String(e.timeEfficiency ?? "-"))}</li>
      <li>توازن مشارکت: ${escapeHtml(String(e.participationBalance ?? "-"))}</li>
    </ul>`);
  }

  if (r.keyTopics?.length) {
    parts.push(
      `<h2>موضوعات کلیدی</h2><ul>${r.keyTopics.map((t) => `<li>${escapeHtml(t.topic)}${t.count ? ` (${escapeHtml(String(t.count))})` : ""}</li>`).join("")}</ul>`,
    );
  }
  if (r.sentimentBySpeaker?.length) {
    parts.push(
      `<h2>تحلیل احساسات به‌تفکیک گوینده</h2><ul>${r.sentimentBySpeaker.map((s) => `<li>${escapeHtml(s.speaker)}: ${escapeHtml(s.sentiment)}${s.note ? ` - ${escapeHtml(s.note)}` : ""}</li>`).join("")}</ul>`,
    );
  }
  if (r.tensionMoments?.length) {
    parts.push(
      `<h2>لحظات تنش‌دار</h2><ul>${r.tensionMoments.map((t) => `<li>${escapeHtml(t.context)} - ${escapeHtml(t.description)}</li>`).join("")}</ul>`,
    );
  }
  const ne = r.namedEntities;
  if (
    ne &&
    (ne.people?.length ||
      ne.organizations?.length ||
      ne.projects?.length ||
      ne.dates?.length ||
      ne.locations?.length)
  ) {
    parts.push(`<h2>نهادهای نام‌دار (NER)</h2><ul>
      ${ne.people?.length ? `<li>افراد: ${escapeHtml(ne.people.join("، "))}</li>` : ""}
      ${ne.organizations?.length ? `<li>شرکت‌ها: ${escapeHtml(ne.organizations.join("، "))}</li>` : ""}
      ${ne.projects?.length ? `<li>پروژه‌ها: ${escapeHtml(ne.projects.join("، "))}</li>` : ""}
      ${ne.dates?.length ? `<li>تاریخ‌ها: ${escapeHtml(ne.dates.join("، "))}</li>` : ""}
      ${ne.locations?.length ? `<li>مکان‌ها: ${escapeHtml(ne.locations.join("، "))}</li>` : ""}
    </ul>`);
  }
  if (r.glossary?.length) {
    parts.push(
      `<h2>واژه‌نامه اصطلاحات تخصصی</h2><ul>${r.glossary.map((g) => `<li><b>${escapeHtml(g.term)}</b>: ${escapeHtml(g.definition)}</li>`).join("")}</ul>`,
    );
  }
  const cp = r.conversationPatterns;
  if (cp?.mostQuestionsBy || cp?.mostDecisionsBy || cp?.notes) {
    parts.push(`<h2>الگوی مکالمه</h2><ul>
      ${cp.mostQuestionsBy ? `<li>بیشترین سوال‌پرسنده: ${escapeHtml(cp.mostQuestionsBy)}</li>` : ""}
      ${cp.mostDecisionsBy ? `<li>بیشترین تصمیم‌گیرنده: ${escapeHtml(cp.mostDecisionsBy)}</li>` : ""}
      ${cp.notes ? `<li>${escapeHtml(cp.notes)}</li>` : ""}
    </ul>`);
  }
  if (r.agreements?.length || r.disagreements?.length) {
    parts.push(`<h2>توافق‌ها و اختلاف‌نظرها</h2><ul>
      ${(r.agreements || []).map((a) => `<li>✅ ${escapeHtml(a)}</li>`).join("")}
      ${(r.disagreements || []).map((d) => `<li>❌ ${escapeHtml(d)}</li>`).join("")}
    </ul>`);
  }
  if (r.suggestedAgenda?.length) {
    parts.push(
      `<h2>پیشنهاد دستور جلسه‌ی بعدی</h2><ul>${r.suggestedAgenda.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`,
    );
  }

  return parts.join("");
}

async function getIncludeFullTranscript() {
  const settings = await settingsStore.getAll();
  return !!settings.includeFullTranscript;
}

/** Strategy Pattern: every exporter turns a Meeting into a downloadable Blob. */
export class BaseExporter {
  // eslint-disable-next-line no-unused-vars
  async export(meeting) {
    throw new Error("export() must be implemented by subclass");
  }

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export class TxtExporter extends BaseExporter {
  async export(meeting) {
    const includeFullTranscript = await getIncludeFullTranscript();
    const participation = meeting.speakerParticipation
      .map((p) => `${p.speaker}: ${p.percentage}%`)
      .join("\n");

    const pieces = [];
    if (includeFullTranscript) pieces.push(meeting.plainTranscript);
    if (participation)
      pieces.push(`--- درصد مشارکت افراد ---\n${participation}`);
    pieces.push("mhkarami97.ir");
    const text = pieces.join("\n\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    this.download(blob, `${safeName(meeting)}.txt`);
  }
}

export class MarkdownExporter extends BaseExporter {
  async export(meeting) {
    const includeFullTranscript = await getIncludeFullTranscript();
    const markdown = new MeetingReportMarkdownBuilder(meeting, {
      includeFullTranscript,
    }).build();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    this.download(blob, `${safeName(meeting)}.md`);
  }
}

/**
 * Produces a Word-openable file using the "HTML + MS Office XML namespaces"
 * trick (saved with a .doc extension). Avoids bundling a real OOXML/zip
 * writer while still opening cleanly in Microsoft Word / LibreOffice.
 */
export class WordExporter extends BaseExporter {
  async export(meeting) {
    const includeFullTranscript = await getIncludeFullTranscript();
    const html = this.buildHtml(meeting, includeFullTranscript);
    const blob = new Blob(["\ufeff", html], {
      type: "application/msword;charset=utf-8",
    });
    this.download(blob, `${safeName(meeting)}.doc`);
  }

  buildHtml(meeting, includeFullTranscript) {
    const r = meeting.report;
    const decisions = (r?.keyDecisions || [])
      .map((d) => `<li>${escapeHtml(d)}</li>`)
      .join("");
    const actions = (r?.actionItems || [])
      .map(
        (a) =>
          `<li>${escapeHtml(a.description)} - ${escapeHtml(a.owner || "نامشخص")}</li>`,
      )
      .join("");
    const questions = (r?.openQuestions || [])
      .map((q) => `<li>${escapeHtml(q)}</li>`)
      .join("");
    const risks = (r?.risks || [])
      .map((rk) => `<li>${escapeHtml(rk)}</li>`)
      .join("");
    const segmentsHtml = includeFullTranscript
      ? `<h2>متن کامل جلسه</h2>${meeting.segments.map((s) => `<p><b>${escapeHtml(s.speaker)}:</b> ${escapeHtml(s.text)}</p>`).join("")}`
      : "";

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(meeting.title)} - mhkarami97.ir</title></head>
<body dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif">
<h1>${escapeHtml(meeting.title)}</h1>
<h2>درصد مشارکت افراد</h2><ul>${participationListHtml(meeting)}</ul>
${extendedAnalysisHtml(meeting)}
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || "-")}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
<h2>سوالات باز</h2><ul>${questions}</ul>
<h2>ریسک‌ها</h2><ul>${risks}</ul>
${segmentsHtml}
<hr><p style="font-size:11px;color:#888">ساخته‌شده با AI Meet - mhkarami97.ir</p>
</body></html>`;
  }
}

export class PdfExporter extends BaseExporter {
  async export(meeting) {
    const includeFullTranscript = await getIncludeFullTranscript();
    const html = this.buildPrintableHtml(meeting, includeFullTranscript);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, "_blank");
    if (!printWindow) return;
    printWindow.addEventListener("load", () => {
      printWindow.document.title = `mhkarami97.ir - ${meeting.title}`;
      printWindow.focus();
      printWindow.print();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    });
  }

  buildPrintableHtml(meeting, includeFullTranscript) {
    const r = meeting.report;
    const decisions = (r?.keyDecisions || [])
      .map((d) => `<li>${escapeHtml(d)}</li>`)
      .join("");
    const actions = (r?.actionItems || [])
      .map((a) => `<li>${escapeHtml(a.description)}</li>`)
      .join("");
    const segmentsHtml = includeFullTranscript
      ? `<h2>متن کامل جلسه</h2><div>${meeting.segments.map((s) => `<p><b>${escapeHtml(s.speaker)}:</b> ${escapeHtml(s.text)}</p>`).join("")}</div>`
      : "";

    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap">
<style>
body{font-family:Vazirmatn,Tahoma,sans-serif;padding:32px;line-height:1.8}
h1{color:#4c1d95}h2{color:#2563eb;border-bottom:1px solid #eee;padding-bottom:4px}
.site-footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center}
</style>
<title>mhkarami97.ir - ${escapeHtml(meeting.title)}</title></head>
<body>
<h1>${escapeHtml(meeting.title)}</h1>
<h2>درصد مشارکت افراد</h2><ul>${participationListHtml(meeting)}</ul>
${extendedAnalysisHtml(meeting)}
<h2>خلاصه اجرایی</h2><p>${escapeHtml(r?.executiveSummary || "-")}</p>
<h2>تصمیمات</h2><ul>${decisions}</ul>
<h2>اقدامات</h2><ul>${actions}</ul>
${segmentsHtml}
<div class="site-footer">ساخته‌شده با AI Meet - mhkarami97.ir</div>
</body></html>`;
  }
}

export const exporters = {
  txt: new TxtExporter(),
  md: new MarkdownExporter(),
  doc: new WordExporter(),
  pdf: new PdfExporter(),
};
