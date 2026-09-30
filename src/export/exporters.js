import { MeetingReportMarkdownBuilder } from "./markdown-builder.js";
import { settingsStore } from "../background/settings-store.js";

var HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return HTML_ESCAPE_MAP[c];
  });
}

function safeName(meeting) {
  return (
    meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-]/g, "").slice(0, 60) +
    "-" +
    meeting.id
  );
}

function participationListHtml(meeting) {
  return meeting.speakerParticipation
    .map(function (p) {
      return "<li>" + escapeHtml(p.speaker) + " - " + p.percentage + "%</li>";
    })
    .join("");
}

function extendedAnalysisHtml(meeting) {
  var r = meeting.report;
  if (!r) return "";
  var parts = [];

  var e = r.effectivenessScore;
  if (e && e.score !== null && e.score !== undefined) {
    parts.push(
      "<h2>امتیاز اثربخشی جلسه</h2><p><b>" +
        escapeHtml(String(e.score)) +
        "/100</b></p><p>" +
        escapeHtml(e.summary) +
        "</p><ul>" +
        "<li>سرعت تصمیم‌گیری: " +
        escapeHtml(String(e.decisionSpeed != null ? e.decisionSpeed : "-")) +
        "</li>" +
        "<li>شفافیت اقدامات: " +
        escapeHtml(String(e.actionClarity != null ? e.actionClarity : "-")) +
        "</li>" +
        "<li>بهره‌وری زمان: " +
        escapeHtml(String(e.timeEfficiency != null ? e.timeEfficiency : "-")) +
        "</li>" +
        "<li>توازن مشارکت: " +
        escapeHtml(
          String(e.participationBalance != null ? e.participationBalance : "-"),
        ) +
        "</li>" +
        "</ul>",
    );
  }

  if (r.keyTopics && r.keyTopics.length) {
    parts.push(
      "<h2>موضوعات کلیدی</h2><ul>" +
        r.keyTopics
          .map(function (t) {
            return (
              "<li>" +
              escapeHtml(t.topic) +
              (t.count ? " (" + escapeHtml(String(t.count)) + ")" : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul>",
    );
  }

  if (r.sentimentBySpeaker && r.sentimentBySpeaker.length) {
    parts.push(
      "<h2>احساسات به تفکیک گوینده</h2><ul>" +
        r.sentimentBySpeaker
          .map(function (s) {
            return (
              "<li>" +
              escapeHtml(s.speaker) +
              ": " +
              escapeHtml(s.sentiment) +
              (s.note ? " - " + escapeHtml(s.note) : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul>",
    );
  }

  if (r.tensionMoments && r.tensionMoments.length) {
    parts.push(
      "<h2>لحظات تنش</h2><ul>" +
        r.tensionMoments
          .map(function (t) {
            return (
              "<li>" +
              escapeHtml(t.context) +
              " - " +
              escapeHtml(t.description) +
              "</li>"
            );
          })
          .join("") +
        "</ul>",
    );
  }

  var ne = r.namedEntities;
  if (
    ne &&
    ((ne.people && ne.people.length) ||
      (ne.organizations && ne.organizations.length) ||
      (ne.projects && ne.projects.length) ||
      (ne.dates && ne.dates.length) ||
      (ne.locations && ne.locations.length))
  ) {
    parts.push(
      "<h2>موجودیت‌های نام‌دار (NER)</h2><ul>" +
        (ne.people && ne.people.length
          ? "<li>افراد: " + escapeHtml(ne.people.join("، ")) + "</li>"
          : "") +
        (ne.organizations && ne.organizations.length
          ? "<li>سازمان‌ها: " +
            escapeHtml(ne.organizations.join("، ")) +
            "</li>"
          : "") +
        (ne.projects && ne.projects.length
          ? "<li>پروژه‌ها: " + escapeHtml(ne.projects.join("، ")) + "</li>"
          : "") +
        (ne.dates && ne.dates.length
          ? "<li>تاریخ‌ها: " + escapeHtml(ne.dates.join("، ")) + "</li>"
          : "") +
        (ne.locations && ne.locations.length
          ? "<li>مکان‌ها: " + escapeHtml(ne.locations.join("، ")) + "</li>"
          : "") +
        "</ul>",
    );
  }

  if (r.glossary && r.glossary.length) {
    parts.push(
      "<h2>واژه‌نامه</h2><ul>" +
        r.glossary
          .map(function (g) {
            return (
              "<li><b>" +
              escapeHtml(g.term) +
              "</b>: " +
              escapeHtml(g.definition) +
              "</li>"
            );
          })
          .join("") +
        "</ul>",
    );
  }

  var cp = r.conversationPatterns;
  if (cp && (cp.mostQuestionsBy || cp.mostDecisionsBy || cp.notes)) {
    parts.push(
      "<h2>الگوهای گفتگو</h2><ul>" +
        (cp.mostQuestionsBy
          ? "<li>بیشترین سؤال از: " + escapeHtml(cp.mostQuestionsBy) + "</li>"
          : "") +
        (cp.mostDecisionsBy
          ? "<li>بیشترین تصمیم از: " + escapeHtml(cp.mostDecisionsBy) + "</li>"
          : "") +
        (cp.notes ? "<li>" + escapeHtml(cp.notes) + "</li>" : "") +
        "</ul>",
    );
  }

  if (
    (r.agreements && r.agreements.length) ||
    (r.disagreements && r.disagreements.length)
  ) {
    parts.push(
      "<h2>توافقات و اختلافات</h2><ul>" +
        (r.agreements || [])
          .map(function (a) {
            return "<li>✅ " + escapeHtml(a) + "</li>";
          })
          .join("") +
        (r.disagreements || [])
          .map(function (d) {
            return "<li>❌ " + escapeHtml(d) + "</li>";
          })
          .join("") +
        "</ul>",
    );
  }

  if (r.suggestedAgenda && r.suggestedAgenda.length) {
    parts.push(
      "<h2>دستور جلسه پیشنهادی بعدی</h2><ul>" +
        r.suggestedAgenda
          .map(function (a) {
            return "<li>" + escapeHtml(a) + "</li>";
          })
          .join("") +
        "</ul>",
    );
  }

  return parts.join("");
}

async function getIncludeFullTranscript() {
  var settings = await settingsStore.getAll();
  return !!settings.includeFullTranscript;
}

/**
 * Strategy Pattern: every exporter turns a Meeting into a downloadable Blob.
 */
export class BaseExporter {
  // eslint-disable-next-line no-unused-vars
  async export(meeting) {
    throw new Error("export() must be implemented by subclass");
  }

  download(blob, filename) {
    var url = URL.createObjectURL(blob);
    chrome.downloads.download({ url: url, filename: filename, saveAs: true });
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }
}

export class TxtExporter extends BaseExporter {
  async export(meeting) {
    var includeFullTranscript = await getIncludeFullTranscript();
    var participation = meeting.speakerParticipation
      .map(function (p) {
        return p.speaker + ": " + p.percentage + "%";
      })
      .join("\n");
    var pieces = [];
    if (includeFullTranscript) pieces.push(meeting.plainTranscript);
    if (participation) pieces.push("--- مشارکت ---\n" + participation);
    pieces.push("mhkarami97.ir");
    var text = pieces.join("\n\n");
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    this.download(blob, safeName(meeting) + ".txt");
  }
}

export class MarkdownExporter extends BaseExporter {
  async export(meeting) {
    var includeFullTranscript = await getIncludeFullTranscript();
    var markdown = new MeetingReportMarkdownBuilder(meeting, {
      includeFullTranscript: includeFullTranscript,
    }).build();
    var blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    this.download(blob, safeName(meeting) + ".md");
  }
}

/**
 * Produces a Word-openable file using the HTML + MS Office XML namespaces
 * trick, saved with a .doc extension. Avoids bundling a real OOXML/zip
 * writer while still opening cleanly in Microsoft Word / LibreOffice.
 */
export class WordExporter extends BaseExporter {
  async export(meeting) {
    var includeFullTranscript = await getIncludeFullTranscript();
    var html = this.buildHtml(meeting, includeFullTranscript);
    var blob = new Blob(["\ufeff", html], {
      type: "application/msword;charset=utf-8",
    });
    this.download(blob, safeName(meeting) + ".doc");
  }

  buildHtml(meeting, includeFullTranscript) {
    var r = meeting.report;
    var decisions = ((r && r.keyDecisions) || [])
      .map(function (d) {
        return "<li>" + escapeHtml(d) + "</li>";
      })
      .join("");
    var actions = ((r && r.actionItems) || [])
      .map(function (a) {
        return (
          "<li>" +
          escapeHtml(a.description) +
          (a.owner ? " - " + escapeHtml(a.owner) : "") +
          "</li>"
        );
      })
      .join("");
    var questions = ((r && r.openQuestions) || [])
      .map(function (q) {
        return "<li>" + escapeHtml(q) + "</li>";
      })
      .join("");
    var risks = ((r && r.risks) || [])
      .map(function (rk) {
        return "<li>" + escapeHtml(rk) + "</li>";
      })
      .join("");
    var segmentsHtml = includeFullTranscript
      ? "<h2>رونوشت کامل</h2>" +
        meeting.segments
          .map(function (s) {
            return (
              "<p><b>" +
              escapeHtml(s.speaker) +
              "</b>: " +
              escapeHtml(s.text) +
              "</p>"
            );
          })
          .join("")
      : "";

    return (
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8">' +
      "</head>" +
      '<body dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif">' +
      "<h1>" +
      escapeHtml(meeting.title) +
      "</h1>" +     
      extendedAnalysisHtml(meeting) +
      "<h2>خلاصه اجرایی</h2><p>" +
      escapeHtml((r && r.executiveSummary) || "-") +
      "</p>" +
      "<h2>تصمیمات کلیدی</h2><ul>" +
      decisions +
      "</ul>" +
      "<h2>اقدامات</h2><ul>" +
      actions +
      "</ul>" +
      "<h2>سؤالات باز</h2><ul>" +
      questions +
      "</ul>" +
      "<h2>ریسک‌ها</h2><ul>" +
      risks +
      "</ul>" +
      "<h2>مشارکت گویندگان</h2><ul>" +
      participationListHtml(meeting) +
      "</ul>" +
      segmentsHtml +
      '<hr><p style="font-size:11px;color:#888">AI Meet - mhkarami97.ir</p>' +
      "</body></html>"
    );
  }
}

export class PdfExporter extends BaseExporter {
  async export(meeting) {
    var includeFullTranscript = await getIncludeFullTranscript();
    var html = this.buildPrintableHtml(meeting, includeFullTranscript);
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var blobUrl = URL.createObjectURL(blob);
    var printWindow = window.open(blobUrl, "_blank");
    if (!printWindow) return;
    printWindow.addEventListener("load", function () {
      printWindow.document.title = meeting.title;
      printWindow.focus();
      printWindow.print();
    });
    setTimeout(function () {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  }

  buildPrintableHtml(meeting, includeFullTranscript) {
    var r = meeting.report;
    var decisions = ((r && r.keyDecisions) || [])
      .map(function (d) {
        return "<li>" + escapeHtml(d) + "</li>";
      })
      .join("");
    var actions = ((r && r.actionItems) || [])
      .map(function (a) {
        return "<li>" + escapeHtml(a.description) + "</li>";
      })
      .join("");
    var segmentsHtml = includeFullTranscript
      ? "<h2>رونوشت کامل</h2><div>" +
        meeting.segments
          .map(function (s) {
            return (
              "<p><b>" +
              escapeHtml(s.speaker) +
              "</b>: " +
              escapeHtml(s.text) +
              "</p>"
            );
          })
          .join("") +
        "</div>"
      : "";

    return (
      '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap">' +
      "<style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:32px;line-height:1.8}h1{color:#4c1d95}h2{color:#2563eb;border-bottom:1px solid #eee;padding-bottom:4px}.site-footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center}</style>" +
      "</head><body>" +
      "<h1>" +
      escapeHtml(meeting.title) +
      "</h1>" +
      "<h2>خلاصه اجرایی</h2><p>" +
      escapeHtml((r && r.executiveSummary) || "-") +
      "</p>" +     
      extendedAnalysisHtml(meeting) +      
      "<h2>تصمیمات کلیدی</h2><ul>" +
      decisions +
      "</ul>" +
      "<h2>اقدامات</h2><ul>" +
      actions +
      "</ul>" +
       "<h2>مشارکت گویندگان</h2><ul>" +
      participationListHtml(meeting) +
      "</ul>" +
      segmentsHtml +
      '<div class="site-footer">AI Meet - mhkarami97.ir</div>' +
      "</body></html>"
    );
  }
}

export var exporters = {
  txt: new TxtExporter(),
  md: new MarkdownExporter(),
  doc: new WordExporter(),
  pdf: new PdfExporter(),
};
