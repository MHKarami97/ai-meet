const JSON_SCHEMA_INSTRUCTION = `
فقط و فقط یک JSON معتبر با دقیقاً این کلیدها برگردان (بدون Markdown، بدون توضیح اضافه، بدون بک‌تیک). اگر بخشی در جلسه مطرح نشده، آرایه‌ی خالی یا مقدار null بگذار ولی هیچ فیلدی را حذف نکن:
{
  "executiveSummary": "خلاصه اجرایی جلسه در ۳ تا ۶ جمله فارسی روان",
  "sections": [{"title": "عنوان بخش موضوعی", "content": "شرح آن بخش", "type": "presentation یا discussion یا task-assignment یا status-report", "tone": "formal یا informal یا critical"}],
  "keyDecisions": ["تصمیم قطعی گرفته‌شده ۱"],
  "actionItems": [{"description": "اقدام مورد نیاز", "owner": "نام مسئول یا null", "dueDate": "تاریخ یا null"}],
  "openQuestions": ["سوال یا موضوع حل‌نشده ۱"],
  "risks": ["ریسک یا نکته مهمی که باید دنبال شود"],
  "keyTopics": [{"topic": "مفهوم یا موضوع پرتکرار", "count": "تخمین تعداد اشاره به آن به‌صورت عدد"}],
  "sentimentBySpeaker": [{"speaker": "نام گوینده", "sentiment": "مثبت یا منفی یا خنثی", "note": "توضیح کوتاه چرا"}],
  "tensionMoments": [{"context": "در چه بخشی از جلسه (مثلاً هنگام بحث بودجه)", "description": "چرا بحث تنش‌دار یا حساس شد"}],
  "namedEntities": {"people": ["اسم افراد ذکرشده"], "organizations": ["شرکت‌ها/تیم‌ها"], "projects": ["نام پروژه‌ها"], "dates": ["تاریخ‌های مطرح‌شده"], "locations": ["مکان‌های مطرح‌شده"]},
  "glossary": [{"term": "اصطلاح فنی یا تخصصی استفاده‌شده", "definition": "توضیح کوتاه آن اصطلاح بر اساس متن جلسه"}],
  "conversationPatterns": {"mostQuestionsBy": "نام کسی که بیشترین سوال پرسید یا null", "mostDecisionsBy": "نام کسی که بیشترین تصمیم گرفت یا null", "notes": "توضیح کوتاه الگوی مکالمه"},
  "agreements": ["نقطه‌ای که همه یا اکثر شرکت‌کنندگان روی آن توافق دارند"],
  "disagreements": ["نقطه‌ای که اختلاف‌نظر وجود دارد"],
  "suggestedAgenda": ["آیتم پیشنهادی برای دستور جلسه بعدی، بر اساس سوالات باز و اکشن‌آیتم‌های ناتمام"],
  "effectivenessScore": {"score": "عدد صحیح ۰ تا ۱۰۰ برای اثربخشی کلی جلسه", "decisionSpeed": "عدد ۰ تا ۱۰۰", "actionClarity": "عدد ۰ تا ۱۰۰", "timeEfficiency": "عدد ۰ تا ۱۰۰", "participationBalance": "عدد ۰ تا ۱۰۰", "summary": "یک جمله توضیح امتیاز"}
}`;

export const PROMPT_TEMPLATES = [
  {
    id: "general-technical",
    name: "جلسه فنی عمومی",
    description:
      "مناسب استندآپ، بحث فنی آزاد یا هر جلسه‌ای که قالب مشخصی ندارد.",
    systemInstruction: `شما یک دستیار حرفه‌ای ثبت جلسات فنی هستید. متن پیاده‌شده‌ی زیر مربوط به یک جلسه فنی تیم نرم‌افزار است. روی راه‌حل‌های مطرح‌شده، تصمیمات معماری/فنی، و کارهای باقی‌مانده تمرکز کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "code-review",
    name: "کد ریویو / Pull Request",
    description: "جلسات بررسی کد، merge/refactor و بحث‌های کیفیت کد.",
    systemInstruction: `این جلسه یک نشست بررسی کد (Code Review) است. نکات کیفیت کد، خطرات امنیتی یا عملکردی مطرح‌شده، توافق‌های merge/refactor، و اقدامات لازم برای تغییر کد را استخراج کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "architecture-design",
    name: "طراحی معماری",
    description: "جلسات تصمیم‌گیری معماری، انتخاب فناوری یا طراحی سیستم.",
    systemInstruction: `این یک جلسه طراحی معماری نرم‌افزار است. گزینه‌های معماری مطرح‌شده، دلایل رد یا پذیرش هر گزینه، Trade-off ها، و تصمیم نهایی معماری را دقیق و شفاف استخراج کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "incident-postmortem",
    name: "بررسی حادثه (Postmortem)",
    description: "جلسات تحلیل یک اختلال یا Incident پس از رفع آن.",
    systemInstruction: `این جلسه یک Postmortem/بررسی حادثه است. علت ریشه‌ای (Root Cause)، Timeline حادثه، تاثیر روی کاربران/سیستم، و اقدامات پیشگیرانه‌ی آینده را با دقت بالا مشخص کن. در ریسک‌ها حتماً احتمال تکرار حادثه را ذکر کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "sprint-planning",
    name: "برنامه‌ریزی اسپرینت (Scrum)",
    description: "جلسات Sprint Planning و تخصیص Backlog به اسپرینت.",
    systemInstruction: `شما به‌عنوان Scrum Master این جلسه‌ی برنامه‌ریزی اسپرینت را خلاصه می‌کنید. آیتم‌های Backlog انتخاب‌شده، تخمین‌ها، ظرفیت تیم، و ریسک‌های رسیدن به هدف اسپرینت را استخراج کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "retrospective",
    name: "رترو",
    description: "جلسات بازنگری اسپرینت یا پروژه (چه خوب پیش رفت / چه بد بود).",
    systemInstruction: `این جلسه رتروسپکتیو تیم است. نکات مثبتی که باید ادامه یابند، نکات منفی که باید اصلاح شوند، و مهم‌تر از همه اقدامات بهبود مشخص (actionItems) با مسئول را استخراج کن. تصمیمات (keyDecisions) باید شامل تغییرات فرآیندی توافق‌شده باشد.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "business-general",
    name: "جلسه بیزینسی عمومی",
    description: "جلسات مدیریتی، هماهنگی بین‌تیمی یا بررسی وضعیت پروژه.",
    systemInstruction: `این یک جلسه بیزینسی/مدیریتی است. روی وضعیت پروژه، KPI ها، تصمیمات مدیریتی، بودجه (اگر مطرح شد)، و اقدامات بین‌تیمی تمرکز کن. از اصطلاحات فنی غیرضروری پرهیز کن و خروجی برای مدیران قابل‌فهم باشد.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "sales-client",
    name: "جلسه فروش / مشتری",
    description: "تماس یا جلسه با مشتری، مذاکره فروش یا ارائه محصول.",
    systemInstruction: `این جلسه با یک مشتری یا مخاطب فروش برگزار شده است. نیازها و دردهای مطرح‌شده مشتری، مخالفت‌ها یا نگرانی‌های او (Objections)، تعهدات دو طرف، و قدم بعدی مذاکره (Next Step) را دقیق استخراج کن. در ریسک‌ها هر نگرانی مشتری درباره قیمت/زمان‌بندی/رقیب را ذکر کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "hiring-interview",
    name: "مصاحبه استخدام",
    description: "جلسات مصاحبه فنی یا HR برای ارزیابی کاندید.",
    systemInstruction: `این جلسه یک مصاحبه استخدامی است. نقاط قوت و ضعف کاندید بر اساس صحبت‌های او، سوالات فنی/رفتاری پرسیده‌شده و کیفیت پاسخ‌ها را خلاصه کن. در keyDecisions نتیجه‌گیری یا توصیه نهایی تیم مصاحبه‌کننده (رد/تایید/مرحله بعد) را با دلیل بیاور.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "board-strategy",
    name: "جلسه هیئت‌مدیره / استراتژی",
    description: "جلسات سطح بالای استراتژیک، سرمایه‌گذاری یا تصمیمات کلان.",
    systemInstruction: `این یک جلسه استراتژیک سطح هیئت‌مدیره یا مدیران ارشد است. تصمیمات کلان، تغییرات استراتژی، ریسک‌های تجاری/مالی/بازار، و مسئولیت‌های اجرایی محول‌شده به هر مدیر را با دقت و رسمیت بالا استخراج کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "training-webinar",
    name: "آموزش / وبینار",
    description:
      "جلسات آموزشی، وبینار داخلی یا انتقال دانش (Knowledge Transfer).",
    systemInstruction: `این یک جلسه آموزشی یا انتقال دانش است. خلاصه اجرایی باید موضوعات آموزشی اصلی را پوشش دهد، sections را بر اساس بخش‌های آموزشی مطرح‌شده بساز، و در openQuestions سوالاتی که شرکت‌کنندگان پرسیدند و بی‌پاسخ ماند را ثبت کن.${JSON_SCHEMA_INSTRUCTION}`,
  },
  {
    id: "quick-summary",
    name: "خلاصه سریع (بدون جزئیات)",
    description: "برای جلسات کوتاه که فقط یک خلاصه فشرده لازم دارید.",
    systemInstruction: `فقط یک خلاصه بسیار فشرده از این جلسه بده. executiveSummary باید در ۳ تا ۵ جمله کل جلسه را پوشش دهد. سایر فیلدهای آرایه‌ای/شیء را در صورت نبود اطلاعات کافی خالی بگذار.${JSON_SCHEMA_INSTRUCTION}`,
  },
];

export function getTemplateById(id) {
  return PROMPT_TEMPLATES.find((t) => t.id === id) || PROMPT_TEMPLATES[0];
}

/** Builds the final prompt sent to an AI provider (or shown to the user in manual mode). */
export function buildPrompt(template, transcriptText) {
  return `${template.systemInstruction}\n\n--- متن پیاده‌شده جلسه ---\n${transcriptText}\n--- پایان متن جلسه ---`;
}
