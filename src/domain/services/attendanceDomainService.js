import { ATTENDANCE_MODE, ATTENDANCE_STATE } from '../constants/attendance.js';

const ALLOWED_STATES = new Set(Object.values(ATTENDANCE_STATE));
const ALLOWED_MODES = new Set(Object.values(ATTENDANCE_MODE));

export function assertState(state) {
  if (!ALLOWED_STATES.has(state)) {
    throw new Error(`Estado inválido: ${state}`);
  }
}

export function assertMode(mode) {
  if (!ALLOWED_MODES.has(mode)) {
    throw new Error(`Modo inválido: ${mode}`);
  }
}

export function shouldAutomationReply(attendance) {
  if (!attendance) return true;
  if (attendance.modo === ATTENDANCE_MODE.MANUAL) return false;
  return ![ATTENDANCE_STATE.CLOSED, ATTENDANCE_STATE.CANCELLED].includes(attendance.estado);
}
