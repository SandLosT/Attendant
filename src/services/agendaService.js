import { db } from '../database/index.js';

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function listarSlotsDisponiveis(dias = 14) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + Math.max(dias, 1) - 1);

  return db('agenda_slots')
    .where('data', '>=', formatDate(hoje))
    .andWhere('data', '<=', formatDate(limite))
    .andWhere({ bloqueado: 0 })
    .whereRaw('reservados < capacidade')
    .orderBy('data', 'asc');
}

export async function preReservarSlot(dataYYYYMMDD, periodo) {
  const periodoNormalizado = normalizarPeriodo(periodo);

  const updated = await db('agenda_slots')
    .where({ data: dataYYYYMMDD, periodo: periodoNormalizado, bloqueado: 0 })
    .whereRaw('reservados < capacidade')
    .update({ reservados: db.raw('reservados + 1') });

  return updated > 0;
}

export async function liberarSlot(dataYYYYMMDD, periodo) {
  const periodoNormalizado = normalizarPeriodo(periodo);

  const updated = await db('agenda_slots')
    .where({ data: dataYYYYMMDD, periodo: periodoNormalizado, bloqueado: 0 })
    .where('reservados', '>', 0)
    .update({ reservados: db.raw('reservados - 1') });

  return updated > 0;
}

export async function confirmarSlot(dataYYYYMMDD, periodo) {
  const periodoNormalizado = normalizarPeriodo(periodo);

  const slot = await db('agenda_slots')
    .select('id')
    .where({ data: dataYYYYMMDD, periodo: periodoNormalizado, bloqueado: 0 })
    .first();

  return Boolean(slot);
}

export function normalizarPeriodo(texto) {
  if (!texto) {
    return null;
  }

  const normalized = texto
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  if (normalized.includes('manha')) {
    return 'MANHA';
  }

  if (normalized.includes('tarde')) {
    return 'TARDE';
  }

  return null;
}

function extrairDataValida(data) {
  if (!data) {
    return null;
  }

  const parsed = new Date(data.ano, data.mes - 1, data.dia);
  if (
    parsed.getFullYear() !== data.ano ||
    parsed.getMonth() !== data.mes - 1 ||
    parsed.getDate() !== data.dia
  ) {
    return null;
  }

  return formatDate(parsed);
}

export function extrairDataEPeriodo(texto) {
  if (!texto) {
    return { data: null, periodo: null };
  }

  const periodo = normalizarPeriodo(texto);
  const textoNormalizado = texto.toString();

  const matchIso = textoNormalizado.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (matchIso) {
    const data = extrairDataValida({
      ano: Number(matchIso[1]),
      mes: Number(matchIso[2]),
      dia: Number(matchIso[3]),
    });
    return { data, periodo };
  }

  const matchCompleto = textoNormalizado.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (matchCompleto) {
    const data = extrairDataValida({
      ano: Number(matchCompleto[3]),
      mes: Number(matchCompleto[2]),
      dia: Number(matchCompleto[1]),
    });
    return { data, periodo };
  }

  const matchCurto = textoNormalizado.match(/\b(\d{2})\/(\d{2})\b/);
  if (matchCurto) {
    const hoje = new Date();
    const data = extrairDataValida({
      ano: hoje.getFullYear(),
      mes: Number(matchCurto[2]),
      dia: Number(matchCurto[1]),
    });
    return { data, periodo };
  }

  return { data: null, periodo };
}
