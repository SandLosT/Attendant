import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationOrchestrator } from '../../src/application/orchestration/conversationOrchestrator.js';

test('data sem período pede confirmação de manhã/tarde', async () => {
  const calls = [];
  const stubClient = {
    async listTools() { return []; },
    async getPrompt() { return { messages: [{ role: 'system', content: '' }] }; },
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === 'get_customer_context') {
        return {
          customer: { id: 7, telefone: '5511999' },
          attendance: { estado: 'WAITING_SCHEDULE', modo: 'AUTO' },
          activeQuote: { id: 1, status: 'APPROVED' },
          messages: [],
        };
      }
      return { ok: true };
    },
  };

  const orchestrator = new ConversationOrchestrator({ mcpClient: stubClient });
  const result = await orchestrator.handleIncomingText({ phone: '5511999', text: '28/04' });

  assert.equal(result.replied, true);
  assert.match(result.message, /manhã ou tarde/i);
  assert.equal(calls.some((item) => item.name === 'send_customer_message'), true);
});
