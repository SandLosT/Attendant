import express from 'express';
import { ownerAuth } from '../http/middleware/ownerAuth.js';
import {
  listSlots,
  findSlot,
  createSlot,
  updateSlot,
} from '../repositories/scheduleRepository.js';
import { normalizePeriod } from '../domain/services/scheduleDomainService.js';

const router = express.Router();

router.use(ownerAuth);

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  // ISO datetime: 2026-04-30T04:00:00.000Z
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // BR date: 30/04/2026
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return text.slice(0, 10);
}

function getDefaultCapacity() {
  return Number(process.env.AGENDA_CAPACIDADE_PADRAO || 3);
}

router.get('/', async (req, res) => {
  try {
    const from = normalizeDateOnly(
      typeof req.query.from === 'string' ? req.query.from : formatDate(new Date()),
    );

    const to = normalizeDateOnly(
      typeof req.query.to === 'string'
        ? req.query.to
        : formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
    );

    const slots = await listSlots({
      dataInicio: from,
      dataFim: to,
    });

    return res.json({
      ok: true,
      from,
      to,
      slots,
    });
  } catch (error) {
    console.error('[owner/agenda] erro ao listar agenda', {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      erro: error?.message || 'Erro ao listar agenda',
    });
  }
});

router.post('/bloquear', async (req, res) => {
  try {
    const data = normalizeDateOnly(req.body?.data);
    const periodo = normalizePeriod(req.body?.periodo);

    if (!data || !periodo) {
      return res.status(400).json({
        erro: 'data e periodo são obrigatórios',
      });
    }

    const slot =
      (await findSlot(data, periodo)) ||
      (await createSlot({
        data,
        periodo,
        capacidade: getDefaultCapacity(),
        reservados: 0,
        bloqueado: 0,
      }));

    const updated = await updateSlot(slot.id, {
      bloqueado: 1,
    });

    return res.json({
      ok: true,
      slot: updated,
    });
  } catch (error) {
    console.error('[owner/agenda/bloquear] erro ao bloquear slot', {
      body: req.body,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      erro: error?.message || 'Erro ao bloquear slot',
    });
  }
});

router.post('/desbloquear', async (req, res) => {
  try {
    const data = normalizeDateOnly(req.body?.data);
    const periodo = normalizePeriod(req.body?.periodo);

    if (!data || !periodo) {
      return res.status(400).json({
        erro: 'data e periodo são obrigatórios',
      });
    }

    const slot = await findSlot(data, periodo);

    if (!slot) {
      return res.status(404).json({
        erro: 'slot não encontrado',
      });
    }

    const updated = await updateSlot(slot.id, {
      bloqueado: 0,
    });

    return res.json({
      ok: true,
      slot: updated,
    });
  } catch (error) {
    console.error('[owner/agenda/desbloquear] erro ao desbloquear slot', {
      body: req.body,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      erro: error?.message || 'Erro ao desbloquear slot',
    });
  }
});

export default router;