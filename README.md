# AI Meet

افزونه مرورگر (Chrome / Edge — Manifest V3) برای ضبط، رونوشت‌برداری و خلاصه‌سازی هوشمند جلسات Google Meet با پشتیبانی کامل زبان فارسی. کاملاً سمت کلاینت اجرا می‌شود؛ هیچ سروری لازم نیست.

## امکانات

- خواندن زیرنویس زنده‌ی خود Google Meet (فارسی/انگلیسی/...) و ذخیره با گوینده + تایم‌استمف
- ذخیره کامل تاریخچه جلسات در IndexedDB (بدون محدودیت حجمی chrome.storage)
- خلاصه، تصمیمات، اقدامات، سوالات باز و ریسک‌ها — به‌صورت ساختاریافته
- ۱۲ قالب پرامٕت آماده (فنی، Code Review، معماری، Postmortem، Sprint Planning، رتروسٕکتیو، بیزینسی، فروش، مصاحبه، هیأت‌مدیره، آموزشی، خلاصه سریع) + امکان افزودن قالب اختصاصی
- چند Provider هوش مصنوعی هم‌زمان: Gemini مستقیم، Gemini از طریق Cloudflare AI Gateway (برای دورزدن فیلترینگ شبکه شرکتی)، هر سرور هم‌سازگار با OpenAI (از جمله Ollama خودمیزبان)
- **حالت بدون کلید (کپی دستی):** اگر کلید API ندارید، افزونه یک متن آماده (پرامپت + متن جلسه) می‌سازد که در هر چت هوش مصنوعی (ChatGPT، Gemini، Claude، ...) پیست می‌کنید؛ پاسخ JSON را کپی و در افزونه وارد می‌کنید تا بدون هیچ فراخوانی شبکه‌ای، گزارش ساخته و مرتب شود
- خروجی PDF، Word (.doc)، TXT و Markdown — همه کاملاً آفلاین و بدون کتابخانه خارجی
- همگام‌سازی اختیاری با GitHub (هر جلسه در یک پوشه با report.md، transcript.txt، meeting.json)
- ظاهر مدرن با فونت Vazirmatn و راست‌به‌چپ کامل

## نصب (Load Unpacked)

1. مخزن را کلون کنید: `git clone https://github.com/MHKarami97/ai-meet.git`
2. Chrome یا Edge را باز کنید و به `chrome://extensions` یا `edge://extensions` بروید
3. «Developer mode» را فعال کنید
4. روی «Load unpacked» بزنید و پوشه‌ی ریشه‌ی پروژه را انتخاب کنید
5. از طریق آیکون افزونه وارد تنظیمات شوید و در صورت دلخواه چند Provider تعریف کنید (یا همان Provider پیش‌فرض «بدون کلید» را نگه دارید)

## مسیرهای راه‌اندازی Provider

- **بدون هیچ کلید:** کاری لازم نیست؛ حالت پیش‌فرض فعال است.
- **Gemini مستقیم:** یک Provider از نوع Gemini بسازید و کلید Google AI Studio را وارد کنید.
- **Gemini از پشت فیلترینگ شرکتی:** یک Provider از نوع «Cloudflare AI Gateway» بسازید؛ باید در Cloudflare یک AI Gateway با provider `google-ai-studio` و BYOK کلید Gemini ساخته باشید.
- **مدل خودمیزبان:** یک Provider از نوع OpenAI-compatible با Base URL سرور Ollama/LM Studio خودتان بسازید.

## نکته مهم درباره زبان

باید داخل خود Google Meet، زیرنویس زنده (Captions) را روی فارسی تنظیم کنید (⚙️ Settings > Captions). افزونه فقط همان زیرنویسی که گوگل تولید می‌کند را می‌خواند و ذخیره می‌کند.

## معماری کد

```
src/
  ai/            Strategy زبانی: providers.js + prompt-templates.js
  background/    service-worker.js (Router) + summarizer.js (Template Method) + settings-store.js + github-sync.js
  content/       meet-capture.js — خواندن caption از DOM صفحه Meet
  db/            models.js + database.js (Repository روی IndexedDB)
  export/        exporters.js (Strategy) + markdown-builder.js (Builder)
  ui/            sidepanel + options (رابط کاربری)
```

## تفییرات این نسخه (0.2.0)

- رفع خطای `Default locale was specified, but _locales subtree is missing` با افزودن `_locales/en` و `_locales/fa` و استفاده از `__MSG_extName__`/`__MSG_extDescription__` در manifest.json
- افزودن آیکون‌های واقعی افزونه (16/48/128px)
- افزودن حالت کامل «بدون کلید (کپی دستی)» در Provider ها، summarizer و رابط کاربری Side Panel
- افزودن دسترسی `clipboardWrite` و `downloads` مورد نیاز صادرات و کپی خودکار
