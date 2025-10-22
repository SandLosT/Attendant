import { db } from '../database/index.js';

let embeddingColumnPromise;
async function hasEmbeddingColumn() {
  if (!embeddingColumnPromise) {
    embeddingColumnPromise = db.schema.hasColumn('imagens', 'embedding');
  }
  return embeddingColumnPromise;
}

export async function salvarImagem({
  clienteId,
  caminho,
  nomeOriginal,
  hash = null,
  embedding = null
}) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para salvar a imagem.');
  }

  const payload = {
    cliente_id: clienteId,
    caminho,
    nome_original: nomeOriginal,
  };

  if (hash) {
    payload.hash = hash;
  }

  if (embedding) {
    const canPersistEmbedding = await hasEmbeddingColumn();
    if (canPersistEmbedding) {
      payload.embedding = JSON.stringify(embedding);
    }
  }

  return db('imagens').insert(payload);
}

export async function listarImagens() {
  return db('imagens').select('*');
}

export async function obterImagensPorCliente(clienteId, limite = 3) {
  if (!clienteId) {
    return [];
  }

  return db('imagens')
    .where({ cliente_id: clienteId })
    .orderBy('data_envio', 'desc')
    .limit(limite);
}
