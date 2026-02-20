import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let openaiClient = null;

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getOpenAIClient() {
  if (!hasOpenAIKey()) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }

  return openaiClient;
}

function getOpenAITemperature() {
  const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
  return Number.isFinite(temperature) ? temperature : 0.7;
}

function respostaSemChave() {
  return { ok: false, reason: 'NO_API_KEY' };
}

export function openAIKeyDisponivel() {
  return hasOpenAIKey();
}

export async function gerarResposta(prompt) {
  if (!hasOpenAIKey()) {
    return respostaSemChave();
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return respostaSemChave();
  }

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: Number.isFinite(temperature) ? temperature : getOpenAITemperature(),
    });
    return { ok: true, content: completion.choices[0].message.content.trim() };
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return { ok: false, reason: 'OPENAI_ERROR', error: err };
  }
}

export async function gerarRespostaHumana({ telefone, mensagem, contexto } = {}) {
  if (!hasOpenAIKey()) {
    return respostaSemChave();
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return respostaSemChave();
  }

  const contextoLoja = contexto?.loja || 'Sem informações da loja.';
  const contextoHistorico = contexto?.historico || 'Sem histórico disponível.';
  const contextoImagens = contexto?.imagens || 'Nenhuma imagem enviada.';
  const estadoAtendimento = contexto?.estadoAtendimento || 'Não informado';

  const systemPrompt = [
    'Você é um atendente humano de uma oficina automotiva.',
    'Responda em pt-BR com tom humano, curto e cordial.',
    'Evite repetir informações.',
    'Não invente preços, prazos ou disponibilidade de agenda.',
    'Se precisar de foto para ajudar, peça de forma natural.',
    'Se estiver aguardando aprovação do responsável, mantenha consistência com isso.',
  ].join(' ');

  const userPrompt = `
Contexto da oficina:
${contextoLoja}

Estado do atendimento: ${estadoAtendimento}

Histórico recente:
${contextoHistorico}

Imagens recebidas:
${contextoImagens}

Cliente (${telefone || 'sem telefone informado'}): "${mensagem || ''}"
`.trim();

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: Number.isFinite(temperature) ? temperature : getOpenAITemperature(),
    });
    return { ok: true, content: completion.choices[0].message.content.trim() };
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return { ok: false, reason: 'OPENAI_ERROR', error: err };
  }
}

export async function gerarRespostaChat({ messages = [], fallback = '' } = {}) {
  if (!hasOpenAIKey()) {
    return respostaSemChave();
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return respostaSemChave();
  }

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : getOpenAITemperature(),
    });
    return { ok: true, content: completion.choices[0].message.content.trim() };
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return { ok: false, reason: 'OPENAI_ERROR', error: err };
  }
}
