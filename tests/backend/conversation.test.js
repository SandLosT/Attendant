import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationOrchestrator } from '../../src/application/orchestration/conversationOrchestrator.js';

function createStubClient({ attendance }) {
  const calls = [];
  const context = {
    customer: { id: 7, telefone: '5511999' },
    attendance,
    activeQuote: { id: 1, status: 'APPROVED' },
    messages: [],
    operationalSignals: [],
  };

  const client = {
    calls,
    async listTools() { return []; },
    async getPrompt() { return { messages: [{ role: 'system', content: '' }] }; },
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === 'get_customer_context') return context;
      if (name === 'get_shop_info') return { ok: true, endereco: 'Av. Brasil, 1000 - Centro' };
      if (name === 'resume_automatic_flow') return { ...attendance, estado: 'OPEN', modo: 'AUTO' };
      return { ok: true };
    },
  };

  return client;
}

test('WAITING_IMAGE: não tenho foto oferece alternativa sem insistência', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'não tenho foto' });

  assert.equal(result.replied, true);
  assert.match(result.message, /sem problema/i);
  assert.match(result.message, /descreve|descrição/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'IMAGE_INPUT_UNAVAILABLE'), true);
});

test('WAITING_IMAGE: não consigo mandar foto oferece alternativa', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'não consigo mandar foto agora' });

  assert.equal(result.replied, true);
  assert.match(result.message, /não consegue enviar foto|descreve/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'IMAGE_INPUT_UNAVAILABLE'), true);
});

test('WAITING_SCHEDULE: ainda não sei a data registra pendência sem pressionar', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_SCHEDULE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'ainda não sei a data' });

  assert.equal(result.replied, true);
  assert.match(result.message, /sem pressa|tranquilo/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'SCHEDULE_UNDEFINED'), true);
});

test('pedido de humano tem prioridade em qualquer estado', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'quero falar com alguém' });

  assert.equal(result.state, 'HUMAN_HANDOFF');
  assert.equal(stubClient.calls.some((item) => item.name === 'escalate_to_human'), true);
});

test('mudança de assunto para endereço responde e retoma com naturalidade', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'qual o endereço?' });

  assert.equal(result.replied, true);
  assert.match(result.message, /nosso endereço/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'get_shop_info'), true);
});

test('objeção comercial: só quero uma noção de valor gera resposta sem compromisso', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'só quero uma noção de valor' });

  assert.equal(result.replied, true);
  assert.match(result.message, /sem compromisso|noção de valor/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'COMMERCIAL_OBJECTION'), true);
});

test('encerramento: deixa pra lá gera pausa com confirmação leve', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_SCHEDULE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'deixa pra lá' });

  assert.equal(result.replied, true);
  assert.match(result.message, /posso pausar|pode encerrar/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'CANCELLATION_SIGNAL'), true);
});

test('incompreensão: não entendi gera explicação simplificada', async () => {
  const stubClient = createStubClient({ attendance: { estado: 'WAITING_IMAGE', modo: 'AUTO' } });
  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });

  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: 'não entendi' });

  assert.equal(result.replied, true);
  assert.match(result.message, /te explico|forma simples/i);
  assert.equal(stubClient.calls.some((item) => item.name === 'register_attendance_constraint' && item.args.kind === 'CUSTOMER_CONFUSION'), true);
});
