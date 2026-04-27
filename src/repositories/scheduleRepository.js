import { db } from '../database/index.js';

export async function findSlot(data, periodo) {
  return db('agenda_slots').where({ data, periodo }).first();
}

export async function createSlot(payload) {
  await db('agenda_slots').insert(payload);
  return findSlot(payload.data, payload.periodo);
}

export async function updateSlot(id, payload) {
  await db('agenda_slots').where({ id }).update(payload);
  return db('agenda_slots').where({ id }).first();
}

export async function listSlots(from, to) {
  return db('agenda_slots')
    .whereBetween('data', [from, to])
    .orderBy('data', 'asc')
    .orderBy('periodo', 'asc');
}
