/**
 * Strategy interface for every AI summarization backend.
 * Concrete providers (Gemini, Cloudflare AI Gateway, OpenAI-compatible, Manual)
 * must implement `complete(prompt)` and resolve the raw text returned by the model.
 * @see https://refactoring.guru/design-patterns/strategy
 */
export class AiProvider {
  constructor({ id, name, apiKey = '', baseUrl = '', model = '' } = {}) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  // eslint-disable-next-line no-unused-vars
  async complete(prompt) {
    throw new Error('complete() must be implemented by subclass');
  }
}

/** Marker used by the summarizer to detect providers that require manual copy/paste instead of a network call. */
export class ManualProviderMarker extends AiProvider {
  isManual = true;

  async complete() {
    throw new Error('Manual provider cannot call complete() directly. Use MeetingSummarizer.buildManualPrompt instead.');
  }
}
