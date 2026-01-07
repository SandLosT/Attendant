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
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function getOpenAITemperature() {
  const parsed = Number(process.env.OPENAI_TEMPERATURE);
  return Number.isFinite(parsed) ? parsed : 0.6;
}

function respostaHumanaFallback() {
  return 'Obrigada pela mensagem! Já vou verificar e te respondo. Se puder, envie uma foto do amassado para eu ajudar melhor.';
}

export function openAIKeyDisponivel() {
  return hasOpenAIKey();
}

export async function gerarResposta(prompt) {
  if (!hasOpenAIKey()) {
    return respostaHumanaFallback();
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return respostaHumanaFallback();
  }

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: getOpenAITemperature(),
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return respostaHumanaFallback();
  }
}

export async function gerarRespostaHumana({ telefone, mensagem, contexto } = {}) {
  if (!hasOpenAIKey()) {
    return respostaHumanaFallback();
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return respostaHumanaFallback();
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
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: getOpenAITemperature(),
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return respostaHumanaFallback();
  }
}
