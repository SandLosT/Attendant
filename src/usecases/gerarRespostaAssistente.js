import { gerarRespostaChat } from '../services/openaiService.js';

function montarFallback(objetivo = '', dados = {}) {
  const objetivoNormalizado = objetivo.toLowerCase();
  const dataBr = dados?.dataBr || '';
  const periodoTxt = dados?.periodoTxt || '';

  if (objetivoNormalizado.includes('pedir foto')) {
    return 'Pode me enviar uma foto do carro e indicar qual parte precisa de reparo?';
  }

  if (objetivoNormalizado.includes('pedir data')) {
    return 'Qual a data (dd/mm)? Se quiser, pode dizer manhã ou tarde.';
  }

  if (objetivoNormalizado.includes('confirmar pré-reserva')) {
    if (dataBr) {
      const periodo = periodoTxt ? ` (${periodoTxt})` : '';
      return `Perfeito, pré-reservei ${dataBr}${periodo}. Vou confirmar com o responsável e já te retorno.`;
    }
    return 'Perfeito, já pré-reservei e vou confirmar com o responsável para te responder.';
  }

  if (objetivoNormalizado.includes('aguardando dono')) {
    return 'Estou aguardando a confirmação do responsável e já te retorno.';
  }

  if (objetivoNormalizado.includes('sugerir próxima vaga')) {
    if (dataBr) {
      const periodo = periodoTxt ? ` (${periodoTxt})` : '';
      return `A próxima vaga é ${dataBr}${periodo}. Pode ser?`;
    }
    return 'A próxima vaga disponível é em outra data. Pode sugerir uma data que funcione?';
  }

  if (objetivoNormalizado.includes('pedir outra data')) {
    return 'Essa semana está completa. Pode sugerir outra data?';
  }

  if (objetivoNormalizado.includes('atendimento finalizado')) {
    return 'Por aqui está tudo finalizado. Quando quiser um novo orçamento, é só me chamar.';
  }

  return objetivo;
}

export default async function gerarRespostaAssistente({
  telefone,
  clienteId,
  estado,
  mensagemUsuario,
  objetivo,
  dados,
} = {}) {
  const fallback = montarFallback(objetivo, dados);

  const systemPrompt = [
    'Escreva em pt-BR, tom humano e natural, curto.',
    'Nada de “Olá! Sou um assistente virtual…”.',
    'Evite repetir a mesma frase em mensagens consecutivas.',
    'Faça 1 pergunta por vez quando precisar de informação.',
    'Se o objetivo for pedir foto: peça foto + qual parte do carro.',
    'Se o objetivo for pedir data: peça dd/mm e opcional manhã/tarde.',
    'Se objetivo for confirmar: confirme e diga próximo passo.',
    'Não invente datas/valores ou detalhes que não estejam nos dados.',
  ].join(' ');

  const userPrompt = `
Contexto do atendimento:
- Telefone: ${telefone || 'não informado'}
- ClienteId: ${clienteId || 'não informado'}
- Estado: ${estado || 'não informado'}
- Mensagem do cliente: ${mensagemUsuario || ''}

Objetivo: ${objetivo || 'não informado'}
Dados disponíveis: ${dados ? JSON.stringify(dados) : 'nenhum'}

Responda apenas com o texto final para enviar ao cliente.
`.trim();

  const resposta = await gerarRespostaChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    fallback,
  });

  return resposta || fallback;
}
