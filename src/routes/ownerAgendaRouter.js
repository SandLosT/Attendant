import express from 'express';
import { db } from '../database/index.js';
import { ensureSlotExists, normalizarPeriodo } from '../services/agendaService.js';

const router = express.Router();

function ownerAuth(req, res, next) {
  const expectedToken = process.env.OWNER_AUTH_TOKEN;
  const authHeader = req.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (!expectedToken) {
    return res.status(500).json({ erro: 'OWNER_AUTH_TOKEN não configurado' });
  }

  if (scheme !== 'Bearer' || !token || token !== expectedToken) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  return next();
}

router.use(ownerAuth);

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toISODate(dateOrString) {
  if (!dateOrString) {
    return null;
  }

  if (dateOrString instanceof Date) {
    return formatDate(dateOrString);
  }

  if (typeof dateOrString === 'string') {
    const isoMatch = dateOrString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return isoMatch[0];
    }
  }

  return null;
}

router.post('/gerar', async (req, res) => {
  const { dias, capacidade } = req.body || {};
  const diasGerar = Number(dias) || 30;
  const capacidadeFinal = Number(capacidade) || 1;

  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  let gerados = 0;

  for (let i = 0; i < diasGerar; i += 1) {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + i);
    const dataISO = formatDate(data);

    const slotManha = await ensureSlotExists(dataISO, 'MANHA', capacidadeFinal);
    const slotTarde = await ensureSlotExists(dataISO, 'TARDE', capacidadeFinal);

    if (slotManha?.criado) {
      gerados += 1;
    }

    if (slotTarde?.criado) {
      gerados += 1;
    }
  }

  return res.json({ ok: true, gerados });
});

router.get('/', async (req, res) => {
  const from = toISODate(req.query.from);
  const to = toISODate(req.query.to);

  if (!from || !to) {
    return res
      .status(400)
      .json({ erro: 'Parâmetros from e to são obrigatórios no formato YYYY-MM-DD' });
  }

  const slots = await db('agenda_slots')
    .select('data', 'periodo', 'capacidade', 'reservados', 'bloqueado')
    .whereBetween('data', [from, to])
    .orderBy('data', 'asc')
    .orderBy('periodo', 'asc');

  return res.json({ slots });
});

router.post('/bloquear', async (req, res) => {
  const { data, periodo, bloqueado } = req.body || {};
  const dataISO = toISODate(data);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return res.status(400).json({ erro: 'data e periodo são obrigatórios' });
  }

  await ensureSlotExists(dataISO, periodoNormalizado);

  await db('agenda_slots')
    .where({ data: dataISO, periodo: periodoNormalizado })
    .update({ bloqueado: bloqueado ? 1 : 0 });

  const slot = await db('agenda_slots')
    .where({ data: dataISO, periodo: periodoNormalizado })
    .first();

  return res.json({ slot });
});

export default router;
