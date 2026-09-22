import { AiProvider, ManualProviderMarker } from './provider-interface.js';

function extractGeminiText(json) {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Gemini API (Google AI Studio), direct connection.
 * @see https://ai.google.dev/gemini-api/docs
 */
export class GeminiProvider extends AiProvider {
  async complete(prompt) {
    const model = this.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    return extractGeminiText(await res.json());
  }
}

/**
 * Gemini through Cloudflare AI Gateway (useful when a corporate network blocks
 * generativelanguage.googleapis.com but allows *.cloudflare.com).
 * @see https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/
 */
export class CloudflareGatewayGeminiProvider extends AiProvider {
  constructor(config) {
    super(config);
    this.accountId = config.accountId;
    this.gatewayId = config.gatewayId;
  }

  async complete(prompt) {
    const model = this.model || 'gemini-2.5-flash';
    const url = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${this.gatewayId}/google-ai-studio/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    if (!res.ok) throw new Error(`Cloudflare AI Gateway error ${res.status}: ${await res.text()}`);
    return extractGeminiText(await res.json());
  }
}

/**
 * Any OpenAI Chat Completions compatible endpoint: OpenAI itself, or a
 * self-hosted Ollama / LM Studio server exposed as an http(s) URL.
 */
export class OpenAiCompatibleProvider extends AiProvider {
  async complete(prompt) {
    const base = (this.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? '';
  }
}

/**
 * "No API key" mode: this provider never calls a network endpoint. It only
 * marks the profile so MeetingSummarizer routes the request to
 * `buildManualPrompt()` / `importManualReport()` instead of `complete()`.
 */
export class ManualCopyPasteProvider extends ManualProviderMarker {}

export const PROVIDER_TYPES = Object.freeze({
  GEMINI: 'gemini',
  CLOUDFLARE_GEMINI: 'cloudflare-gemini',
  OPENAI_COMPATIBLE: 'openai-compatible',
  MANUAL: 'manual'
});

/** Factory Pattern: turns a stored provider profile into a live strategy instance. */
export class ProviderFactory {
  static create(profile) {
    switch (profile.type) {
      case PROVIDER_TYPES.GEMINI:
        return new GeminiProvider(profile);
      case PROVIDER_TYPES.CLOUDFLARE_GEMINI:
        return new CloudflareGatewayGeminiProvider(profile);
      case PROVIDER_TYPES.OPENAI_COMPATIBLE:
        return new OpenAiCompatibleProvider(profile);
      case PROVIDER_TYPES.MANUAL:
        return new ManualCopyPasteProvider(profile);
      default:
        throw new Error(`Unknown provider type: ${profile.type}`);
    }
  }
}
