import { db } from '../database/index.js';

const AGENDA_LIMITE_SEMANAL = Number(process.env.AGENDA_LIMITE_SEMANAL) || 5;
const AGENDA_LOOKAHEAD_DIAS = Number(process.env.AGENDA_LOOKAHEAD_DIAS) || 30;
const AGENDA_CAPACIDADE_PADRAO = Number(process.env.AGENDA_CAPACIDADE_PADRAO) || 3;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODate(isoDate) {
  if (!isoDate) {
    return null;
  }

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function toISODate(dateOrString) {
  if (!dateOrString) {
    return null;
  }

  if (dateOrString instanceof Date) {
    return formatDate(dateOrString);
  }

  if (typeof dateOrString === 'string') {
    const isoMatch = dateOrString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const parsed = parseISODate(isoMatch[0]);
      return parsed ? formatDate(parsed) : null;
    }

    const brMatch = dateOrString.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) {
      const parsed = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
      return formatDate(parsed);
    }
  }

  return null;
}

function getWeekRange(isoDate) {
  const parsed = parseISODate(isoDate);
  if (!parsed) {
    return null;
  }

  const dayOfWeek = parsed.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const start = new Date(parsed);
  start.setDate(parsed.getDate() - diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}

async function ensureSlotExists(data, periodo, capacidadePadrao = AGENDA_CAPACIDADE_PADRAO) {
  const dataISO = toISODate(data);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return null;
  }

  const existente = await db('agenda_slots')
    .where({ data: dataISO, periodo: periodoNormalizado })
    .first();

  if (existente) {
    return existente;
  }

  const novoSlot = {
    data: dataISO,
    periodo: periodoNormalizado,
    capacidade: capacidadePadrao,
    reservados: 0,
    bloqueado: 0,
  };

  await db('agenda_slots').insert(novoSlot);
  return { ...novoSlot, criado: true };
}

async function countReservadosSemana(isoDate, trx = db) {
  const range = getWeekRange(isoDate);
  if (!range) {
    return 0;
  }

  const resultado = await trx('agenda_slots')
    .whereBetween('data', [range.start, range.end])
    .sum({ total: 'reservados' })
    .first();

  return Number(resultado?.total || 0);
}

async function isSemanaCheia(isoDate, trx = db) {
  const total = await countReservadosSemana(isoDate, trx);
  return total >= AGENDA_LIMITE_SEMANAL;
}

async function findProximaVagaAPartir(isoDateStart, periodoPreferido) {
  const dataInicial = toISODate(isoDateStart);
  if (!dataInicial) {
    return null;
  }

  const periodoNormalizado = normalizarPeriodo(periodoPreferido);
  const periodosTentativa = ['MANHA', 'TARDE'];
  if (periodoNormalizado) {
    const outro = periodosTentativa.find((periodo) => periodo !== periodoNormalizado);
    periodosTentativa.splice(0, periodosTentativa.length, periodoNormalizado, outro);
  }

  let dataAtual = parseISODate(dataInicial);

  if (AGENDA_LOOKAHEAD_DIAS <= 0) {
    return null;
  }

  for (let i = 0; i < AGENDA_LOOKAHEAD_DIAS && dataAtual; i += 1) {
    const dataISO = formatDate(dataAtual);
    const semanaCheia = await isSemanaCheia(dataISO);

    if (!semanaCheia) {
      for (const periodo of periodosTentativa) {
        await ensureSlotExists(dataISO, periodo);
        const slot = await db('agenda_slots')
          .where({ data: dataISO, periodo })
          .first();

        if (slot && slot.bloqueado === 0 && slot.reservados < slot.capacidade) {
          return { data: dataISO, periodo };
        }
      }
    }

    const proximoDia = new Date(dataAtual);
    proximoDia.setDate(proximoDia.getDate() + 1);
    dataAtual = proximoDia;
  }

  return null;
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
  const dataISO = toISODate(dataYYYYMMDD);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return { ok: false, reason: 'INDISPONIVEL' };
  }

  await ensureSlotExists(dataISO, periodoNormalizado);

  if (await isSemanaCheia(dataISO)) {
    return { ok: false, reason: 'SEMANA_CHEIA' };
  }

  return db.transaction(async (trx) => {
    if (await isSemanaCheia(dataISO, trx)) {
      return { ok: false, reason: 'SEMANA_CHEIA' };
    }

    const slot = await trx('agenda_slots')
      .where({ data: dataISO, periodo: periodoNormalizado })
      .forUpdate()
      .first();

    if (!slot || slot.bloqueado || slot.reservados >= slot.capacidade) {
      return { ok: false, reason: 'INDISPONIVEL' };
    }

    await trx('agenda_slots')
      .where({ id: slot.id })
      .update({ reservados: slot.reservados + 1 });

    return { ok: true };
  });
}

export async function liberarSlot(dataYYYYMMDD, periodo) {
  const dataISO = toISODate(dataYYYYMMDD);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return false;
  }

  await ensureSlotExists(dataISO, periodoNormalizado);

  const updated = await db('agenda_slots')
    .where({ data: dataISO, periodo: periodoNormalizado, bloqueado: 0 })
    .where('reservados', '>', 0)
    .update({ reservados: db.raw('reservados - 1') });

  return updated > 0;
}

export async function confirmarSlot(dataYYYYMMDD, periodo) {
  const dataISO = toISODate(dataYYYYMMDD);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return false;
  }

  const slot = await db('agenda_slots')
    .select('id')
    .where({ data: dataISO, periodo: periodoNormalizado, bloqueado: 0 })
    .first();

  return Boolean(slot);
}

export async function listarDisponibilidade(from, to) {
  const fromISO = toISODate(from);
  const toISO = toISODate(to);

  if (!fromISO || !toISO) {
    return [];
  }

  const slots = await db('agenda_slots')
    .whereBetween('data', [fromISO, toISO])
    .orderBy('data', 'asc')
    .orderBy('periodo', 'asc');

  const semanaCheiaPorDia = {};
  const datas = [...new Set(slots.map((slot) => slot.data))];

  for (const data of datas) {
    semanaCheiaPorDia[data] = await isSemanaCheia(data);
  }

  return slots.map((slot) => ({
    data: slot.data,
    periodo: slot.periodo,
    capacidade: slot.capacidade,
    reservados: slot.reservados,
    bloqueado: slot.bloqueado,
    vagas: slot.capacidade - slot.reservados,
    semana_cheia: semanaCheiaPorDia[slot.data],
  }));
}

export async function setBloqueado(dataYYYYMMDD, periodo, bloqueado) {
  const dataISO = toISODate(dataYYYYMMDD);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return false;
  }

  await ensureSlotExists(dataISO, periodoNormalizado);

  const updated = await db('agenda_slots')
    .where({ data: dataISO, periodo: periodoNormalizado })
    .update({ bloqueado: bloqueado ? 1 : 0 });

  return updated > 0;
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

export {
  ensureSlotExists,
  countReservadosSemana,
  isSemanaCheia,
  findProximaVagaAPartir,
};
