import { ProviderFactory } from '../ai/providers.js';
import { buildPrompt, getTemplateById, PROMPT_TEMPLATES } from '../ai/prompt-templates.js';
import { MeetingReport } from '../db/models.js';
import { settingsStore } from './settings-store.js';

function extractJson(rawText) {
  const cleaned = rawText.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

/**
 * مسئول هماهنگ‌سازی تولید گزارش از روی متن خام جلسه.
 * Provider و Template از طریق Strategy تزریق می‌شوند تا قابل تعویض باشند.
 */
export class MeetingSummarizer {
  async generateReport(meeting, { templateId, providerId } = {}) {
    const settings = await settingsStore.getAll();
    const providerProfile = providerId
      ? settings.providers.find((p) => p.id === providerId)
      : settings.providers.find((p) => p.id === settings.activeProviderId);

    if (!providerProfile) {
      throw new Error('هیچ Provider فعالی تنظیم نشده است. ابتدا از صفحه تنظیمات یک Provider اضافه کنید.');
    }

    const allTemplates = [...PROMPT_TEMPLATES, ...(settings.customTemplates || [])];
    const template =
      allTemplates.find((t) => t.id === (templateId || settings.defaultTemplateId)) || getTemplateById();

    const provider = ProviderFactory.create(providerProfile);
    const prompt = buildPrompt(template, meeting.toPlainText());
    const rawText = await provider.complete(prompt);
    const parsed = extractJson(rawText);

    return new MeetingReport({
      ...parsed,
      templateId: template.id,
      providerId: providerProfile.id,
      generatedAt: Date.now(),
    });
  }
}

export const meetingSummarizer = new MeetingSummarizer();
