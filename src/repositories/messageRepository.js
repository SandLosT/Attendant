import { db } from '../database/index.js';

export async function saveMessage({ customerId, direction, content }) {
  await db('historico_mensagens').insert({
    cliente_id: customerId,
    tipo: direction,
    mensagem: content,
  });
}

export async function listRecentMessages(customerId, limit = 12) {
  return db('historico_mensagens')
    .where({ cliente_id: customerId })
    .orderBy('id', 'desc')
    .limit(limit);
}
