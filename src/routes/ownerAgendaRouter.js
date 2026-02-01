import express from 'express';
import {
  ensureSlotExists,
  listarDisponibilidade,
  normalizarPeriodo,
  setBloqueado,
} from '../services/agendaService.js';

const router = express.Router();

function ownerAuth(req, res, next) {
  const expectedToken = process.env.OWNER_AUTH_TOKEN;
  const authHeader = req.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (!expectedToken) {
    return res.status(500).json({ error: 'unauthorized' });
  }

  if (scheme !== 'Bearer' || !token || token !== expectedToken) {
    return res.status(401).json({ error: 'unauthorized' });
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

function parseISODate(dateString) {
  if (!dateString) {
    return null;
  }
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return null;
  }
  return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
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

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

router.post('/gerar', async (req, res) => {
  const { dias, capacidade, a_partir_de } = req.body || {};
  const diasGerar =
    parsePositiveInt(dias) ??
    parsePositiveInt(process.env.AGENDA_DIAS_GERAR) ??
    30;
  const capacidadeFinal =
    parsePositiveInt(capacidade) ??
    parsePositiveInt(process.env.AGENDA_CAPACIDADE_PADRAO) ??
    3;

  if (!diasGerar || !capacidadeFinal) {
    return res.status(400).json({ erro: 'dias e capacidade devem ser números positivos' });
  }

  const inicio = a_partir_de ? parseISODate(a_partir_de) : new Date();
  if (!inicio) {
    return res.status(400).json({ erro: 'a_partir_de deve estar no formato YYYY-MM-DD' });
  }
  inicio.setHours(0, 0, 0, 0);

  let gerados = 0;
  let existentes = 0;

  for (let i = 0; i < diasGerar; i += 1) {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + i);
    const dataISO = formatDate(data);

    const slotManha = await ensureSlotExists(dataISO, 'MANHA', capacidadeFinal);
    const slotTarde = await ensureSlotExists(dataISO, 'TARDE', capacidadeFinal);

    if (slotManha?.criado) {
      gerados += 1;
    } else {
      existentes += 1;
    }

    if (slotTarde?.criado) {
      gerados += 1;
    } else {
      existentes += 1;
    }
  }

  return res.json({ ok: true, gerados, existentes });
});

router.get('/', async (req, res) => {
  const fromQuery = typeof req.query.from === 'string' ? req.query.from : null;
  const toQuery = typeof req.query.to === 'string' ? req.query.to : null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 14);

  const fromParsed = fromQuery ? toISODate(fromQuery) : null;
  const toParsed = toQuery ? toISODate(toQuery) : null;

  if ((fromQuery && !fromParsed) || (toQuery && !toParsed)) {
    return res
      .status(400)
      .json({ erro: 'Parâmetros from e to devem estar no formato YYYY-MM-DD' });
  }

  const from = fromParsed ?? formatDate(hoje);
  const to = toParsed ?? formatDate(limite);

  if (!from || !to) {
    return res
      .status(400)
      .json({ erro: 'Parâmetros from e to devem estar no formato YYYY-MM-DD' });
  }

  const slots = await listarDisponibilidade(from, to);

  return res.json({ from, to, slots });
});

router.post('/bloquear', async (req, res) => {
  const { data, periodo, bloqueado } = req.body || {};
  const dataISO = toISODate(data);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return res.status(400).json({ erro: 'data e periodo são obrigatórios' });
  }

  const updated = await setBloqueado(
    dataISO,
    periodoNormalizado,
    bloqueado === undefined ? true : Boolean(bloqueado)
  );

  if (!updated) {
    return res.status(400).json({ erro: 'Não foi possível atualizar o bloqueio do slot.' });
  }

  const slots = await listarDisponibilidade(dataISO, dataISO);
  const slot = slots.find((item) => item.periodo === periodoNormalizado) || null;

  return res.json({ slot });
});

router.post('/desbloquear', async (req, res) => {
  const { data, periodo } = req.body || {};
  const dataISO = toISODate(data);
  const periodoNormalizado = normalizarPeriodo(periodo);

  if (!dataISO || !periodoNormalizado) {
    return res.status(400).json({ erro: 'data e periodo são obrigatórios' });
  }

  const updated = await setBloqueado(dataISO, periodoNormalizado, false);

  if (!updated) {
    return res.status(400).json({ erro: 'Não foi possível atualizar o bloqueio do slot.' });
  }

  const slots = await listarDisponibilidade(dataISO, dataISO);
  const slot = slots.find((item) => item.periodo === periodoNormalizado) || null;

  return res.json({ slot });
});

export default router;
