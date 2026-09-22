/**
 * قرارداد Strategy برای تمام ارائه‌دهنده‌های AI. هر Provider جدید باید از این کلاس اروث ببرد
 * و متد summarize را بازنویسی کند.
 */
export class AiProvider {
  constructor({ id, name, apiKey, baseUrl, model }) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  /**
   * @param {string} prompt - پرامپت کامل شامل متن جلسه
   * @returns {Promise<string>} - پاسخ خام مدل (انتظار JSON می‌رود)
   */
  // eslint-disable-next-line no-unused-vars
  async complete(prompt) {
    throw new Error('complete() must be implemented by subclass');
  }
}
