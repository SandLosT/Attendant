import { gerarRespostaChat } from './openaiService.js';

const FALLBACK_TEMPLATES = {
  pedir_foto: [
    'Para seguir, pode me mandar uma foto do dano? Assim consigo te ajudar melhor.',
    'Consegue enviar uma foto do amassado? Isso já agiliza o orçamento.',
    'Se puder, me envie uma foto do amassado e diga qual parte do carro foi afetada.',
    'Me manda uma foto do carro, por favor? Aí eu consigo orientar certinho.',
    'Uma foto do amassado ajuda bastante. Pode enviar quando conseguir?',
    'Se estiver com o carro aí, manda uma foto do local do dano pra eu analisar.',
  ],
  aguardando_aprovacao: [
    'Só um instante, estou confirmando com o responsável e já te retorno.',
    'Estou checando a aprovação com o responsável e já te respondo.',
    'Vou validar com o responsável e já te aviso, tudo bem?',
    'Já estou levando para aprovação e te retorno em seguida.',
    'Deixa comigo: vou confirmar com o responsável e já volto com a resposta.',
  ],
  novo_orcamento: [
    'Claro! Para um novo orçamento, pode me enviar uma foto do amassado?',
    'Bora fazer um novo orçamento? Me manda uma foto do dano, por favor.',
    'Consigo te ajudar sim. Envia uma foto do amassado pra eu analisar?',
    'Vamos seguir com um novo orçamento. Pode mandar uma foto do carro?',
    'Perfeito! Me envia uma foto do dano e me diz qual parte do carro foi afetada.',
  ],
  estimativa_pedir_data: [
    'Pela foto, conseguimos fazer sim. Estimativa em torno de R$ {valor_estimado}. Qual data (dd/mm) você consegue?',
    'Ótimo, dá pra fazer. O valor estimado é R$ {valor_estimado}. Qual dia você prefere deixar o carro?',
    'A estimativa fica em R$ {valor_estimado}. Qual data funciona pra você deixar o carro?',
    'Conseguimos sim. Orçamento estimado de R$ {valor_estimado}. Me diz uma data que funcione.',
    'Pelo que vi, dá pra fazer. Estimativa R$ {valor_estimado}. Qual data você consegue trazer?',
  ],
  avaliacao_humana: [
    'Pela foto, preciso de uma avaliação humana. Vou encaminhar ao responsável e já retorno, ok?',
    'Vou pedir uma análise do responsável para te responder certinho. Já volto com retorno.',
    'Esse caso precisa de avaliação do responsável. Vou encaminhar e já te aviso.',
    'Preciso da avaliação do responsável para confirmar. Já estou encaminhando.',
    'Vou enviar para avaliação humana e te retorno assim que tiver a resposta.',
  ],
  pedir_data: [
    'Qual data (dd/mm) você prefere? Se quiser, pode indicar manhã ou tarde.',
    'Me diz uma data que funcione e, se tiver preferência, manhã ou tarde.',
    'Qual dia seria melhor pra você? Pode indicar manhã/tarde também.',
    'Me passa uma data (dd/mm) que funcione? Se quiser, manhã ou tarde.',
    'Qual data fica melhor pra você? Pode dizer manhã ou tarde.',
  ],
  semana_cheia: [
    'Essa semana já está completa. Quer me passar outra data?',
    'Fechamos essa semana. Pode sugerir outro dia?',
    'Essa semana não tem mais vagas. Me fala outra data, por favor.',
    'Essa semana está cheia. Quer tentar outra data?',
    'Sem vagas nessa semana. Me diz outra data que funcione?',
  ],
  sugerir_vaga: [
    'A próxima vaga é {dataBr} ({periodoTxt}). Pode ser?',
    'Tenho disponibilidade em {dataBr} no período da {periodoTxt}. Funciona?',
    'Posso te atender em {dataBr} ({periodoTxt}). Está ok?',
    'A próxima data disponível é {dataBr} ({periodoTxt}). Serve pra você?',
    'Consigo em {dataBr} no período da {periodoTxt}. Pode ser?',
  ],
  indisponivel: [
    'Não temos vaga nessa data. Quer sugerir outra?',
    'Essa data já está cheia. Pode me dizer outra?',
    'Sem vaga nesse dia. Me passa outra data, por favor.',
    'Esse dia não tem mais vaga. Quer tentar outra data?',
    'Não consegui vaga nessa data. Pode indicar outra?',
  ],
  confirmar_pre_reserva: [
    'Perfeito, pré-reservei {dataBr} ({periodoTxt}). Vou confirmar com o responsável e já retorno.',
    'Certo! Deixei pré-reservado {dataBr} ({periodoTxt}). Vou validar e te aviso.',
    'Combinado, pré-reserva feita para {dataBr} ({periodoTxt}). Já volto com a confirmação.',
    'Pré-reserva feita em {dataBr} ({periodoTxt}). Vou confirmar e te retorno.',
    'Deixei pré-reservado {dataBr} ({periodoTxt}). Já vou confirmar.',
  ],
  finalizado: [
    'Por aqui está tudo finalizado. Se precisar de um novo orçamento, é só me chamar.',
    'Atendimento encerrado por aqui. Quer fazer um novo orçamento?',
    'Tudo certo por aqui. Se quiser um novo orçamento, me avise.',
    'Encerramos este atendimento. Precisa de algo mais ou de um novo orçamento?',
    'Finalizamos por aqui. Quando quiser um novo orçamento, estou à disposição.',
  ],
};

function renderTemplate(template, data = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (data[key] === undefined || data[key] === null) {
      return match;
    }
    return String(data[key]);
  });
}

function pickRandomTemplate(templates) {
  if (!templates || templates.length === 0) {
    return '';
  }
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

function formatValorEstimado(valor) {
  if (!valor) {
    return '---';
  }
  const parsed = Number(valor);
  if (Number.isFinite(parsed)) {
    return parsed.toFixed(2);
  }
  return String(valor);
}

function gerarFallback({ estado, objetivo, dados } = {}) {
  const objetivoNormalizado = (objetivo || '').toLowerCase();
  const valorEstimado = formatValorEstimado(dados?.valor_estimado);

  if (objetivoNormalizado.includes('pedir foto') || estado === 'AGUARDANDO_FOTO') {
    return renderTemplate(pickRandomTemplate(FALLBACK_TEMPLATES.pedir_foto), dados);
  }

  if (estado === 'AGUARDANDO_APROVACAO_DONO') {
    return pickRandomTemplate(FALLBACK_TEMPLATES.aguardando_aprovacao);
  }

  if (objetivoNormalizado.includes('novo orçamento')) {
    return pickRandomTemplate(FALLBACK_TEMPLATES.novo_orcamento);
  }

  if (estado === 'FINALIZADO' || objetivoNormalizado.includes('finalizado')) {
    return pickRandomTemplate(FALLBACK_TEMPLATES.finalizado);
  }

  if (objetivoNormalizado.includes('pedir data')
    && !objetivoNormalizado.includes('informar orçamento')) {
    return renderTemplate(pickRandomTemplate(FALLBACK_TEMPLATES.pedir_data), dados);
  }

  if (objetivoNormalizado.includes('semana cheia')) {
    return pickRandomTemplate(FALLBACK_TEMPLATES.semana_cheia);
  }

  if (objetivoNormalizado.includes('sugerir vaga')) {
    return renderTemplate(pickRandomTemplate(FALLBACK_TEMPLATES.sugerir_vaga), dados);
  }

  if (objetivoNormalizado.includes('indisponivel') || objetivoNormalizado.includes('indisponível')) {
    return pickRandomTemplate(FALLBACK_TEMPLATES.indisponivel);
  }

  if (objetivoNormalizado.includes('confirmar pré-reserva')
    || objetivoNormalizado.includes('confirmar pre-reserva')) {
    return renderTemplate(pickRandomTemplate(FALLBACK_TEMPLATES.confirmar_pre_reserva), dados);
  }

  if (objetivoNormalizado.includes('informar orçamento')) {
    return renderTemplate(
      pickRandomTemplate(FALLBACK_TEMPLATES.estimativa_pedir_data),
      { ...dados, valor_estimado: valorEstimado }
    );
  }

  if (objetivoNormalizado.includes('avaliação')
    || objetivoNormalizado.includes('encaminhar')) {
    return pickRandomTemplate(FALLBACK_TEMPLATES.avaliacao_humana);
  }

  return pickRandomTemplate(FALLBACK_TEMPLATES.pedir_foto);
}

function buildSystemPrompt() {
  return [
    'Você é um atendente humano de uma oficina automotiva.',
    'Responda em pt-BR com tom natural, curto e cordial.',
    'Cumprimente se o cliente tiver cumprimentado.',
    'Evite repetir frases e não pareça robótico.',
    'Responda em uma única mensagem curta.',
    'Faça somente 1 pergunta por vez quando faltar algo.',
    'Siga o objetivo informado e use o contexto da loja.',
    'Não invente preços, prazos ou informações que não estejam nos dados.',
  ].join(' ');
}

export async function gerarRespostaAssistente({
  estado,
  mensagemCliente,
  contextoLoja,
  objetivo,
  dados,
} = {}) {
  const fallback = gerarFallback({
    estado,
    objetivo,
    dados,
  });

  const userPrompt = [
    `Estado: ${estado || 'desconhecido'}`,
    `Objetivo: ${objetivo || 'nao_informado'}`,
    `Contexto da loja: ${contextoLoja || 'nao_informado'}`,
    `Dados: ${JSON.stringify(dados || {})}`,
    `Mensagem do cliente: ${mensagemCliente || ''}`,
  ].join('\n');

  const resposta = await gerarRespostaChat({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userPrompt },
    ],
  });

  if (!resposta?.ok) {
    return fallback;
  }

  return resposta.content || fallback;
}
