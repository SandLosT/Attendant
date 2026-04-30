import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretUserTurn } from '../../src/domain/services/userMessageInterpreter.js';

const attendanceImage = { estado: 'WAITING_IMAGE', modo: 'AUTO' };

test('interpretUserTurn identifica limitação de imagem', () => {
  const result = interpretUserTurn({ text: 'não consigo mandar foto', attendance: attendanceImage });
  assert.equal(result.primarySignal, 'INPUT_UNAVAILABLE');
  assert.equal(result.blockingConstraint.kind, 'IMAGE_INPUT_UNAVAILABLE');
  assert.equal(result.recommendedNextMoves.includes('register_attendance_constraint'), true);
});

test('interpretUserTurn identifica pedido humano', () => {
  const result = interpretUserTurn({ text: 'quero falar com uma pessoa', attendance: attendanceImage });
  assert.equal(result.primarySignal, 'HUMAN_REQUEST');
  assert.equal(result.handoffRequested, true);
});

test('interpretUserTurn identifica objeção comercial', () => {
  const result = interpretUserTurn({ text: 'só quero uma noção de valor', attendance: attendanceImage });
  assert.equal(result.primarySignal, 'COMMERCIAL_OBJECTION');
  assert.equal(result.customerPreference, 'NO_COMMITMENT_ESTIMATE');
});
