import { gerarRespostaChat, openAIKeyDisponivel } from './openaiService.js';

const FALLBACK_TEMPLATES = {
  AGUARDANDO_FOTO: [
    'Pode me enviar uma foto do amassado, por favor? Assim consigo ajudar melhor.',
    'Me manda uma foto do dano quando puder? Isso já agiliza o atendimento.',
    'Para seguir, preciso de uma foto do amassado. Pode enviar?',
  ],
  AGUARDANDO_DATA: {
    pedir_data: [
      'Qual data você prefere? Se quiser, pode dizer manhã ou tarde.',
      'Me diz uma data que funcione e, se tiver preferência, manhã ou tarde.',
      'Qual dia seria melhor pra você? Pode indicar manhã/tarde também.',
    ],
    semana_cheia: [
      'Essa semana já está completa. Quer me passar outra data?',
      'Fechamos essa semana. Pode sugerir outro dia?',
      'Essa semana não tem mais vagas. Me fala outra data, por favor.',
    ],
    sugerir_vaga: [
      'A próxima vaga é {dataBr} ({periodoTxt}). Pode ser?',
      'Tenho disponibilidade em {dataBr} no período da {periodoTxt}. Funciona?',
      'Posso te atender em {dataBr} ({periodoTxt}). Está ok?',
    ],
    indisponivel: [
      'Não temos vaga nessa data. Quer sugerir outra?',
      'Essa data já está cheia. Pode me dizer outra?',
      'Sem vaga nesse dia. Me passa outra data, por favor.',
    ],
    confirmar_pre_reserva: [
      'Perfeito, pré-reservei {dataBr} ({periodoTxt}). Vou confirmar com o responsável e já retorno.',
      'Certo! Deixei pré-reservado {dataBr} ({periodoTxt}). Vou validar e te aviso.',
      'Combinado, pré-reserva feita para {dataBr} ({periodoTxt}). Já volto com a confirmação.',
    ],
  },
  AGUARDANDO_APROVACAO_DONO: [
    'Perfeito, já estou confirmando com o responsável e já te retorno.',
    'Estou checando a aprovação aqui, já volto com a confirmação.',
    'Só um instante que confirmo com o responsável e te aviso.',
  ],
  FINALIZADO: [
    'Tudo certo por aqui. Você quer fazer um novo orçamento?',
    'Concluímos esse atendimento. Precisa de um novo orçamento?',
    'Ficou tudo finalizado. Quer abrir um novo orçamento?',
  ],
};

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickTemplate(templates, seed) {
  if (!templates || templates.length === 0) {
    return '';
  }

  const index = hashString(seed) % templates.length;
  return templates[index];
}

function renderTemplate(template, data = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (data[key] === undefined || data[key] === null) {
      return match;
    }
    return String(data[key]);
  });
}

function gerarFallback({ estado, mensagemUsuario, dadosOrcamento, clienteTelefone }) {
  const acao = dadosOrcamento?.acao;
  const seed = `${estado}|${acao || ''}|${mensagemUsuario || ''}|${clienteTelefone || ''}`;

  if (estado === 'AGUARDANDO_DATA') {
    const templates = FALLBACK_TEMPLATES.AGUARDANDO_DATA[acao] ||
      FALLBACK_TEMPLATES.AGUARDANDO_DATA.pedir_data;
    const base = pickTemplate(templates, seed);
    return renderTemplate(base, dadosOrcamento);
  }

  const templates = FALLBACK_TEMPLATES[estado] || FALLBACK_TEMPLATES.AGUARDANDO_FOTO;
  const base = pickTemplate(templates, seed);
  return renderTemplate(base, dadosOrcamento);
}

function buildSystemPrompt() {
  return [
    'Você é um atendente humano de uma oficina automotiva.',
    'Responda em pt-BR com tom natural, curto e cordial.',
    'Evite parecer robótico e não repita frases.',
    'Sempre peça 1) foto quando AGUARDANDO_FOTO.',
    'Sempre confirme data/periodo quando AGUARDANDO_DATA.',
    'Quando AGUARDANDO_APROVACAO_DONO, responda curto e tranquilizador.',
    'Quando FINALIZADO e o usuário falar algo comum, responda educadamente e pergunte se é novo orçamento.',
  ].join(' ');
}

export async function gerarRespostaHumanizada({
  estado,
  mensagemUsuario,
  dadosOrcamento,
  clienteTelefone,
} = {}) {
  if (!openAIKeyDisponivel()) {
    console.warn('OPENAI_API_KEY ausente');
    return 'Obrigada! Já te respondo por aqui.';
  }

  const fallback = gerarFallback({
    estado,
    mensagemUsuario,
    dadosOrcamento,
    clienteTelefone,
  });

  const userPrompt = [
    `Estado: ${estado || 'desconhecido'}`,
    `Acao: ${dadosOrcamento?.acao || 'nao_informada'}`,
    `Telefone: ${clienteTelefone || 'nao_informado'}`,
    `Dados: ${JSON.stringify(dadosOrcamento || {})}`,
    `Mensagem do cliente: ${mensagemUsuario || ''}`,
  ].join('\n');

  return gerarRespostaChat({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userPrompt },
    ],
    fallback,
  });
}
