import { db } from '../src/database/index.js';

export async function salvarMensagem(cliente_id, mensagem, tipo) {
  await db('historico_mensagens').insert({
    cliente_id,
    mensagem,
    tipo
  });
}

export async function obterUltimasMensagens(cliente_id, limite = 5) {
  return await db('historico_mensagens')
    .where({ cliente_id })
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
