import { ProviderFactory } from '../ai/providers.js';
import { buildPrompt, getTemplateById, PROMPT_TEMPLATES } from '../ai/prompt-templates.js';
import { MeetingReport } from '../db/models.js';
import { settingsStore } from './settings-store.js';

/** Strips ```json fences and stray prose so both API responses and pasted chat answers parse the same way. */
function extractJson(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  return JSON.parse(jsonSlice);
}

async function resolveTemplate(templateId, settings) {
  const allTemplates = [...PROMPT_TEMPLATES, ...settings.customTemplates];
  return allTemplates.find((t) => t.id === templateId) || getTemplateById(settings.defaultTemplateId);
}

/**
 * Orchestrates report generation. Strategy (provider) + Template (prompt) are
 * both swappable without touching this class.
 *
 * Two paths are supported:
 *  1. Automatic - an AiProvider with a real API key calls complete(prompt).
 *  2. Manual    - no key is stored; buildManualPrompt() hands the user a
 *     ready-to-paste prompt, and importManualReport() turns whatever the user
 *     pastes back from any AI chat into the same MeetingReport structure.
 */
export class MeetingSummarizer {
  async generateReport(meeting, templateId, providerId) {
    const settings = await settingsStore.getAll();
    const providerProfile =
      (providerId && settings.providers.find((p) => p.id === providerId)) ||
      settings.providers.find((p) => p.id === settings.activeProviderId);
    if (!providerProfile) throw new Error('هیچ Provider فعالی تنظیم نشده است. به تنظیمات افزونه بروید.');

    if (providerProfile.type === 'manual') {
      throw new Error('این Provider حالت دستی است. از دکمه «ساخت متن برای AI» به‌جای «ساخت گزارش» استفاده کنید.');
    }

    const template = await resolveTemplate(templateId || settings.defaultTemplateId, settings);
    const provider = ProviderFactory.create(providerProfile);
    const prompt = buildPrompt(template, meeting.plainTranscript);
    const rawText = await provider.complete(prompt);
    const parsed = extractJson(rawText);

    return new MeetingReport({
      ...parsed,
      templateId: template.id,
      providerId: providerProfile.id
    });
  }

  /** No network call: returns the exact text the user should paste into any AI chat UI. */
  async buildManualPrompt(meeting, templateId) {
    const settings = await settingsStore.getAll();
    const template = await resolveTemplate(templateId || settings.defaultTemplateId, settings);
    const prompt = buildPrompt(template, meeting.plainTranscript);
    return { template, prompt };
  }

  /** Takes whatever the user pasted back from ChatGPT/Gemini/Claude/etc. and turns it into a MeetingReport. */
  async importManualReport(meeting, templateId, rawAiText) {
    const settings = await settingsStore.getAll();
    const template = await resolveTemplate(templateId || settings.defaultTemplateId, settings);
    const parsed = extractJson(rawAiText);
    return new MeetingReport({
      ...parsed,
      templateId: template.id,
      providerId: 'manual'
    });
  }
}

export const meetingSummarizer = new MeetingSummarizer();
