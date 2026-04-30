import { ATTENDANCE_MODE, ATTENDANCE_STATE } from '../constants/attendance.js';
import { normalizePeriod, parseDateAndPeriod } from './scheduleDomainService.js';

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function includesAny(text, terms = []) {
  return terms.some((term) => text.includes(term));
}

function scoreByPatterns(text, patterns) {
  return patterns.reduce((score, pattern) => {
    const allOk = !pattern.all || pattern.all.every((term) => text.includes(term));
    const anyOk = !pattern.any || includesAny(text, pattern.any);
    return allOk && anyOk ? score + (pattern.weight || 1) : score;
  }, 0);
}

const SIGNAL_DETECTORS = [
  {
    signal: 'HUMAN_REQUEST',
    score: (text) => scoreByPatterns(text, [
      { all: ['falar'], any: ['alguem', 'pessoa', 'humano', 'atendente', 'especialista'], weight: 4 },
      { any: ['atendente humano', 'me passa para o especialista', 'preciso de um atendente'], weight: 4 },
    ]),
  },
  {
    signal: 'RESUME_AUTOMATION',
    score: (text) => scoreByPatterns(text, [
      { any: ['retomar automatico', 'voltar para o automatico', 'seguir no auto', 'seguir no automatico'], weight: 3 },
    ]),
  },
  {
    signal: 'INPUT_UNAVAILABLE',
    score: (text) => scoreByPatterns(text, [
      { all: ['nao tenho'], any: ['foto', 'imagem', 'informacao', 'essa informacao'], weight: 3 },
      { all: ['nao consigo'], any: ['mandar foto', 'enviar foto', 'enviar imagem', 'confirmar agora'], weight: 3 },
      { any: ['camera nao funciona', 'celular nao envia imagem', 'nao sei o periodo', 'nao sei a data', 'nao tenho certeza'], weight: 2 },
    ]),
  },
  {
    signal: 'TOPIC_SHIFT',
    score: (text) => scoreByPatterns(text, [
      { any: ['qual o endereco', 'onde voces ficam', 'que horas abrem', 'atendem seguro', 'qual o telefone', 'posso levar ai'], weight: 3 },
      { any: ['endereco', 'telefone', 'horario', 'localizacao'], weight: 1 },
    ]),
  },
  {
    signal: 'COMMERCIAL_OBJECTION',
    score: (text) => scoreByPatterns(text, [
      { any: ['so quero uma nocao', 'so quero uma ideia', 'estou so pesquisando', 'nao quero fechar agora', 'achei caro', 'vou pensar'], weight: 3 },
      { all: ['quanto'], any: ['sem foto', 'fica sem foto', 'valor sem foto'], weight: 3 },
    ]),
  },
  {
    signal: 'OPERATIONAL_OBJECTION',
    score: (text) => scoreByPatterns(text, [
      { any: ['meu carro esta rodando', 'nao consigo ir ai', 'preciso disso urgente', 'so posso no sabado', 'resolver pessoalmente'], weight: 3 },
      { all: ['urgente'], weight: 2 },
    ]),
  },
  {
    signal: 'CANCELLATION',
    score: (text) => scoreByPatterns(text, [
      { any: ['deixa pra la', 'deixa para la', 'ja resolvi', 'nao preciso mais', 'pode cancelar', 'vou fazer depois'], weight: 4 },
    ]),
  },
  {
    signal: 'CONFUSION',
    score: (text) => scoreByPatterns(text, [
      { any: ['nao entendi', 'explica melhor', 'o que voce precisa', 'pode repetir', 'como assim'], weight: 3 },
    ]),
  },
];

function resolveBlockingConstraint(primarySignal, attendanceState, normalizedText) {
  if (primarySignal !== 'INPUT_UNAVAILABLE') return null;

  if (attendanceState === ATTENDANCE_STATE.WAITING_IMAGE && includesAny(normalizedText, ['foto', 'imagem', 'camera'])) {
    return { kind: 'IMAGE_INPUT_UNAVAILABLE', blockedStage: attendanceState, missingRequiredInput: ['imagem_do_dano'] };
  }

  if (attendanceState === ATTENDANCE_STATE.WAITING_SCHEDULE && includesAny(normalizedText, ['data', 'periodo', 'confirmar'])) {
    return { kind: 'SCHEDULE_INPUT_UNAVAILABLE', blockedStage: attendanceState, missingRequiredInput: ['data_e_periodo'] };
  }

  return { kind: 'GENERIC_INPUT_UNAVAILABLE', blockedStage: attendanceState, missingRequiredInput: [] };
}

function confidenceFromTop(topScore) {
  if (topScore >= 4) return 0.92;
  if (topScore >= 3) return 0.82;
  if (topScore >= 2) return 0.68;
  if (topScore >= 1) return 0.55;
  return 0.35;
}

function buildRecommendedMoves({ primarySignal, attendance, hasDateWithoutPeriod, blockingConstraint, requestedHuman, topicShift }) {
  const moves = [];

  if (requestedHuman) moves.push('escalate_to_human');
  if (primarySignal === 'RESUME_AUTOMATION' && attendance?.modo === ATTENDANCE_MODE.MANUAL) moves.push('resume_automatic_flow');
  if (topicShift?.kind === 'SHOP_INFO') moves.push('get_shop_info');
  if (blockingConstraint) moves.push('register_attendance_constraint');
  if (primarySignal === 'COMMERCIAL_OBJECTION') moves.push('offer_non_committal_estimate');
  if (primarySignal === 'OPERATIONAL_OBJECTION') moves.push('offer_operational_alternative');
  if (primarySignal === 'CONFUSION') moves.push('simplify_request');
  if (primarySignal === 'CANCELLATION') moves.push('confirm_pause_or_cancellation');
  if (hasDateWithoutPeriod) moves.push('request_missing_period');

  if (!moves.length) moves.push('ai_orchestration');
  return moves;
}

export function interpretUserTurn({ text, attendance }) {
  const normalizedText = normalizeText(text);
  const scored = SIGNAL_DETECTORS
    .map((detector) => ({ signal: detector.signal, score: detector.score(normalizedText) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const primarySignal = scored[0]?.signal || 'NONE';
  const secondarySignals = scored.slice(1, 4).map((entry) => entry.signal);

  const parsedSchedule = parseDateAndPeriod(text);
  const hasDate = Boolean(parsedSchedule.data);
  const hasPeriod = Boolean(normalizePeriod(parsedSchedule.periodo));
  const hasDateWithoutPeriod = hasDate && !hasPeriod;

  const blockingConstraint = resolveBlockingConstraint(primarySignal, attendance?.estado, normalizedText);
  const requestedHuman = primarySignal === 'HUMAN_REQUEST';
  const topicShift = primarySignal === 'TOPIC_SHIFT'
    ? { kind: 'SHOP_INFO', confidence: 0.85 }
    : null;

  const recommendedNextMoves = buildRecommendedMoves({
    primarySignal,
    attendance,
    hasDateWithoutPeriod,
    blockingConstraint,
    requestedHuman,
    topicShift,
  });

  return {
    primarySignal,
    secondarySignals,
    blockingConstraint,
    requestedHuman,
    topicShift,
    missingRequiredInput: blockingConstraint?.missingRequiredInput || (hasDateWithoutPeriod ? ['periodo'] : []),
    confidence: confidenceFromTop(scored[0]?.score || 0),
    parsedSchedule,
    recommendedNextMoves,
    urgency: primarySignal === 'OPERATIONAL_OBJECTION' && includesAny(normalizedText, ['urgente']) ? 'HIGH' : 'NORMAL',
    customerPreference: primarySignal === 'COMMERCIAL_OBJECTION' ? 'NO_COMMITMENT_ESTIMATE' : null,
    handoffRequested: requestedHuman,
    raw: { normalizedText, scores: scored },
  };
}
