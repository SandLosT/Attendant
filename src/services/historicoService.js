import { db } from '../database/index.js';

export async function salvarMensagem(clienteId, mensagem, tipo) {
  await db('historico_mensagens').insert({
    cliente_id: clienteId,
    mensagem,
    tipo
  });
}

export async function obterUltimasMensagens(clienteId, limite = 5) {
  return db('historico_mensagens')
    .where({ cliente_id: clienteId })
    .orderBy('data_envio', 'desc')
    .limit(limite);
}

export async function obterOuCriarCliente(telefone) {
  let cliente = await db('clientes').where({ telefone }).first();
  if (!cliente) {
    const ids = await db('clientes').insert({ telefone });
    cliente = await db('clientes').where({ id: ids[0] }).first();
  }
  return cliente;
}
