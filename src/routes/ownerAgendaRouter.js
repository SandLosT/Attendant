import express from 'express';
import { ownerAuth } from '../http/middleware/ownerAuth.js';
import { listSlots, findSlot, createSlot, updateSlot } from '../repositories/scheduleRepository.js';
import { normalizePeriod } from '../domain/services/scheduleDomainService.js';

const router = express.Router();
router.use(ownerAuth);

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

router.get('/', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : formatDate(new Date());
  const to = typeof req.query.to === 'string'
    ? req.query.to
    : formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

  const slots = await listSlots(from, to);
  return res.json({ from, to, slots });
});

router.post('/bloquear', async (req, res) => {
  const data = req.body?.data;
  const periodo = normalizePeriod(req.body?.periodo);
  if (!data || !periodo) return res.status(400).json({ erro: 'data e periodo são obrigatórios' });

  const slot = (await findSlot(data, periodo)) || (await createSlot({ data, periodo, capacidade: 3, reservados: 0, bloqueado: 0 }));
  const updated = await updateSlot(slot.id, { bloqueado: 1 });
  return res.json({ slot: updated });
});

router.post('/desbloquear', async (req, res) => {
  const data = req.body?.data;
  const periodo = normalizePeriod(req.body?.periodo);
  if (!data || !periodo) return res.status(400).json({ erro: 'data e periodo são obrigatórios' });

  const slot = await findSlot(data, periodo);
  if (!slot) return res.status(404).json({ erro: 'slot não encontrado' });

  const updated = await updateSlot(slot.id, { bloqueado: 0 });
  return res.json({ slot: updated });
});

export default router;
