import { db } from './src/database/index.js';

export async function salvarImagem(clienteId, caminho, nomeOriginal, hash) {
  return db('imagens').insert({
    cliente_id: clienteId,
    caminho,
    nome_original: nomeOriginal,
    hash
  });
}

export async function obterImagensPorCliente(clienteId, limite = 3) {
  return db('imagens')
    .where({ cliente_id: clienteId })
    .orderBy('data_envio', 'desc')
    .limit(limite);
}