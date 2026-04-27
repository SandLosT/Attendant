import { db } from '../database/index.js';
import { ATTENDANCE_MODE, ATTENDANCE_STATE } from '../domain/constants/attendance.js';

export async function findAttendanceByCustomerId(customerId) {
  return db('atendimentos').where({ cliente_id: customerId }).first();
}

export async function getOrCreateAttendance(customerId) {
  const existing = await findAttendanceByCustomerId(customerId);
  if (existing) return existing;

  const ids = await db('atendimentos').insert({
    cliente_id: customerId,
    estado: ATTENDANCE_STATE.OPEN,
    modo: ATTENDANCE_MODE.AUTO,
  });
  const id = Array.isArray(ids) ? ids[0] : ids;
  return db('atendimentos').where({ id }).first();
}

export async function updateAttendance(customerId, payload) {
  await db('atendimentos').where({ cliente_id: customerId }).update(payload);
  return findAttendanceByCustomerId(customerId);
}
