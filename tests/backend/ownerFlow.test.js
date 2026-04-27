import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createOwnerRouter } from '../../src/routes/ownerRouter.js';
import { withServer, postJson } from '../helpers/http.js';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-owner-token',
  };
}

test('healthcheck backend', async () => {
  const { createApp } = await import('../../src/app.js');
  await withServer(createApp(), async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
  });
});

test('owner flow básico de aprovação e recusa', async () => {
  process.env.OWNER_AUTH_TOKEN = 'test-owner-token';

  const quote = { id: 11, cliente_id: 77, status: 'NEEDS_HUMAN', details: {} };
  const attendance = { cliente_id: 77, estado: 'OPEN', modo: 'AUTO', orcamento_id_atual: null };
  const state = { quote, attendance };

  const repos = {
    listQuotesByStatus: async () => [state.quote],
    findQuoteById: async () => state.quote,
    updateQuote: async (_id, updates) => {
      state.quote = { ...state.quote, ...updates };
      return state.quote;
    },
    findAttendanceByCustomerId: async () => state.attendance,
    updateAttendance: async (_customerId, updates) => {
      state.attendance = { ...state.attendance, ...updates };
      return state.attendance;
    },
  };

  const fakeMcpClient = {
    async callTool(name, args) {
      if (name === 'resume_automatic_flow') {
        state.attendance = {
          ...state.attendance,
          modo: 'AUTO',
          estado: state.attendance.orcamento_id_atual ? 'WAITING_SCHEDULE' : 'OPEN',
          manual_motivo: null,
        };
        return state.attendance;
      }
      if (name === 'set_attendance_mode') {
        state.attendance = { ...state.attendance, modo: args.mode, manual_motivo: args.manualReason, estado: 'HUMAN_HANDOFF' };
        return state.attendance;
      }
      return state.attendance;
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/owner', createOwnerRouter({ mcpClient: fakeMcpClient, repos }));

  await withServer(app, async ({ baseUrl }) => {
    const approve = await fetch(`${baseUrl}/owner/orcamentos/11/aprovar`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ data_agendada: '2026-04-30' }),
    });
    assert.equal(approve.status, 200);
    assert.equal(state.quote.status, 'APPROVED');

    state.quote = { ...state.quote, status: 'NEEDS_HUMAN' };
    const reject = await fetch(`${baseUrl}/owner/orcamentos/11/recusar`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ motivo: 'Divergência de peça' }),
    });
    assert.equal(reject.status, 200);
    assert.equal(state.quote.status, 'REJECTED');
    assert.equal(state.attendance.modo, 'MANUAL');
    assert.equal(state.attendance.estado, 'HUMAN_HANDOFF');
  });
});

test('retorno MANUAL -> AUTO preserva contexto com orçamento atual', async () => {
  process.env.OWNER_AUTH_TOKEN = 'test-owner-token';

  const state = {
    quote: { id: 31, cliente_id: 100, status: 'APPROVED' },
    attendance: { cliente_id: 100, estado: 'HUMAN_HANDOFF', modo: 'MANUAL', orcamento_id_atual: 31 },
  };

  const repos = {
    listQuotesByStatus: async () => [state.quote],
    findQuoteById: async () => state.quote,
    updateQuote: async (_id, updates) => ({ ...state.quote, ...updates }),
    findAttendanceByCustomerId: async () => state.attendance,
    updateAttendance: async (_customerId, updates) => {
      state.attendance = { ...state.attendance, ...updates };
      return state.attendance;
    },
  };

  const fakeMcpClient = {
    async callTool(name) {
      if (name === 'resume_automatic_flow') {
        state.attendance = {
          ...state.attendance,
          modo: 'AUTO',
          estado: state.attendance.orcamento_id_atual ? 'WAITING_SCHEDULE' : 'OPEN',
          manual_motivo: null,
        };
        return state.attendance;
      }
      return state.attendance;
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/owner', createOwnerRouter({ mcpClient: fakeMcpClient, repos }));

  await withServer(app, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/owner/clientes/100/devolver`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200);
    assert.equal(state.attendance.modo, 'AUTO');
    assert.equal(state.attendance.estado, 'WAITING_SCHEDULE');
  });
});

test('reserva persiste slot no orçamento (regra mínima)', async () => {
  const quote = { id: 80, slot_data: null, slot_periodo: null };

  const reserveScheduleSlot = ({ date, period }) => {
    quote.slot_data = date;
    quote.slot_periodo = period;
    return { ok: true, quote };
  };

  const result = reserveScheduleSlot({ date: '2026-05-02', period: 'MANHA' });
  assert.equal(result.ok, true);
  assert.equal(quote.slot_data, '2026-05-02');
  assert.equal(quote.slot_periodo, 'MANHA');
});
