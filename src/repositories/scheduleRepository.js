import { db } from '../database/index.js';

function normalizeDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // Formato correto: 2026-04-30
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  // ISO: 2026-04-30T04:00:00.000Z
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Formato brasileiro: 30/04/2026
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  // Fallback defensivo
  return text.slice(0, 10);
}

function normalizeSlotPayload(payload = {}) {
  const safePayload = { ...payload };

  if (safePayload.data) {
    safePayload.data = normalizeDateOnly(safePayload.data);
  }

  return safePayload;
}

export async function findSlot(data, periodo) {
  return db('agenda_slots')
    .where({
      data: normalizeDateOnly(data),
      periodo,
    })
    .first();
}

export async function createSlot(payload) {
  const safePayload = normalizeSlotPayload(payload);

  const [id] = await db('agenda_slots').insert(safePayload);

  return findSlot(safePayload.data, safePayload.periodo);
}

export async function updateSlot(id, payload) {
  const safePayload = normalizeSlotPayload(payload);

  await db('agenda_slots')
    .where({ id })
    .update(safePayload);

  return db('agenda_slots')
    .where({ id })
    .first();
}

export async function listSlots({ dataInicio, dataFim } = {}) {
  const query = db('agenda_slots');

  if (dataInicio) {
    query.where('data', '>=', normalizeDateOnly(dataInicio));
  }

  if (dataFim) {
    query.where('data', '<=', normalizeDateOnly(dataFim));
  }

  return query.orderBy([
    { column: 'data', order: 'asc' },
    { column: 'periodo', order: 'asc' },
  ]);
}