import OpenAI from 'openai';

let client;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

export async function createChatCompletion(payload) {
  const openai = getOpenAIClient();
  if (!openai) {
    const error = new Error('OPENAI_API_KEY ausente');
    error.code = 'NO_API_KEY';
    throw error;
  }

  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.4),
    ...payload,
  });
}
