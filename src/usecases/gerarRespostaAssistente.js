import dotenv from 'dotenv';

dotenv.config();

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_TEMPERATURE = 0.6;

const FALLBACKS = {
  AGUARDANDO_FOTO:
    'Me manda uma foto do amassado e, se puder, me diz qual parte do carro é 🙂',
  AGUARDANDO_APROVACAO_DONO:
    'Beleza! Estou confirmando com o responsável e já te retorno.',
  FINALIZADO:
    'Perfeito 🙂 Se quiser um novo orçamento, é só me mandar uma foto do amassado.',
  AGUARDANDO_DATA_SEM_DATA:
    'Pra eu reservar certinho, me diga a data (dd/mm) e se prefere manhã ou tarde.',
};

const OBJECTIVES = {
  AGUARDANDO_FOTO:
    'Pedir UMA foto do amassado e, se possível, qual parte do carro. Ser simpático e direto.',
  AGUARDANDO_APROVACAO_DONO:
    'Avisar que está aguardando confirmação do responsável e que já retorna. Não pedir mais informações.',
  FINALIZADO:
    'Responder algo curto e educado. Se a mensagem indicar novo orçamento, orientar a mandar foto.',
  AGUARDANDO_DATA_SEM_DATA:
    'Pedir a data no formato dd/mm e perguntar se prefere manhã ou tarde de forma humana.',
};

function getEnvNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatExtras(extras) {
  if (!extras || typeof extras !== 'object') {
    return '';
  }

  const entries = Object.entries(extras).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  if (entries.length === 0) {
    return '';
  }

  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

function getFallback(estado) {
  return FALLBACKS[estado] || FALLBACKS.FINALIZADO;
}

function buildUserPrompt({ estado, mensagem, cliente, extras }) {
  const objective = OBJECTIVES[estado] || OBJECTIVES.FINALIZADO;
  const extrasText = formatExtras(extras);

  return [
    `Estado do atendimento: ${estado}`,
    `Objetivo: ${objective}`,
    'Regras: Resposta curta, humana, sem markdown, sem repetir. Não inventar preços, datas, garantias ou prazos.',
    extrasText ? `Extras:\n${extrasText}` : null,
    `Mensagem do cliente: "${mensagem || ''}"`,
    cliente ? `Cliente: ${cliente.nome || cliente.id || 'sem identificação'}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildSystemPrompt() {
  return [
    'Você é um atendente humano de oficina/estética automotiva.',
    'Responda sempre em pt-BR.',
    'Envie uma única mensagem de WhatsApp, curta e natural.',
    'Não invente preços, datas, prazos, disponibilidade ou garantias.',
    'Não diga que é IA e não use markdown.',
    'Seja cordial, objetivo e sem repetição.',
  ].join(' ');
}

export default async function gerarRespostaAssistente({
  estado,
  mensagem,
  cliente,
  extras,
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return getFallback(estado);
  }

  const baseUrl = process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL;
  const model = process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const temperature = getEnvNumber(
    process.env.OPENAI_TEMPERATURE,
    OPENAI_DEFAULT_TEMPERATURE
  );

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ estado, mensagem, cliente, extras });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Erro na OpenAI:', response.status, response.statusText);
      return getFallback(estado);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return getFallback(estado);
    }

    return content;
  } catch (err) {
    console.error('Erro na OpenAI:', err);
    return getFallback(estado);
  }
}
