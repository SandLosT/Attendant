import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function gerarResposta(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return 'Desculpe, houve um problema. Pode tentar novamente?';
  }
}