import { ATTENDANCE_MODE, ATTENDANCE_STATE } from '../../domain/constants/attendance.js';

function compactHistory(messages = []) {
  return messages
    .slice(-8)
    .map((message) => `${message.tipo === 'entrada' ? 'Cliente' : 'Atendente'}: ${message.mensagem}`)
    .join('\n');
}

function stageObjective(state) {
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'coletar uma foto clara do dano';
  if (state === ATTENDANCE_STATE.IN_ANALYSIS) return 'aguardar análise da foto';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'definir data e período (manhã ou tarde)';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'informar que um humano assumiu';
  if (state === ATTENDANCE_STATE.CLOSED) return 'encerrar com confirmação curta';
  return 'entender o problema e avançar para orçamento';
}

function stageStyle(state) {
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'acolhedor e transparente';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'objetivo, confirmando data e período';
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'didático e gentil, pedindo foto nítida';
  return 'profissional, próximo e direto';
}

export function buildConversationContext({ context, customerMessage }) {
  const customer = context?.customer || {};
  const attendance = context?.attendance || {};
  const quote = context?.activeQuote || null;

  const collected = [];
  if (quote?.valor_estimado) collected.push('valor estimado');
  if (quote?.slot_data && quote?.slot_periodo) collected.push('agendamento');
  if (context?.messages?.some((m) => m.tipo === 'entrada')) collected.push('histórico recente');

  const missing = [];
  if (!quote) missing.push('orçamento');
  if (quote && !quote.slot_data) missing.push('data/período');

  return [
    `Cliente: ${customer.nome || 'não informado'} (${customer.telefone || 'sem telefone'})`,
    `Estado do atendimento: ${attendance.estado || ATTENDANCE_STATE.OPEN}`,
    `Modo do atendimento: ${attendance.modo || ATTENDANCE_MODE.AUTO}`,
    `Resumo curto: ${attendance.resumo_curto || 'Cliente em atendimento para funilaria/pintura.'}`,
    `Orçamento atual: ${quote ? `#${quote.id} status=${quote.status}` : 'não existe'}`,
    `Agenda atual: ${quote?.slot_data ? `${quote.slot_data} (${quote.slot_periodo})` : 'não definida'}`,
    `Intervenção humana recente: ${attendance.manual_motivo ? `sim (${attendance.manual_motivo})` : 'não'}`,
    `Dados coletados: ${collected.length ? collected.join(', ') : 'nenhum relevante'}`,
    `Dados faltantes: ${missing.length ? missing.join(', ') : 'nenhum'}`,
    `Objetivo desta etapa: ${stageObjective(attendance.estado)}`,
    `Estilo recomendado: ${stageStyle(attendance.estado)}. Responda em até 3 frases curtas.`,
    `Histórico recente:\n${compactHistory(context?.messages) || 'Sem histórico relevante.'}`,
    `Mensagem atual do cliente: ${customerMessage}`,
  ].join('\n');
}
