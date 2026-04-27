import OpenAI from 'openai';

let client;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

export async function generateAssistantReply({ systemPrompt, contextPrompt }) {
  const openai = getClient();
  if (!openai) return { ok: false, reason: 'NO_API_KEY' };

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.5),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ],
    });

    return { ok: true, content: response.choices?.[0]?.message?.content?.trim() || '' };
  } catch (error) {
    return { ok: false, reason: 'OPENAI_ERROR', error };
  }
}
