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
  console.log(
    '[imagemService] Salvando nova imagem:',
    JSON.stringify({ clienteId, caminho, nomeOriginal, possuiHash: Boolean(hash), possuiEmbedding: Boolean(embedding) })
  );
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

  const resultado = await db('imagens').insert(payload);
  console.log('[imagemService] Imagem registrada no banco com payload:', payload);
  return resultado;
}

export async function listarImagens() {
  console.log('[imagemService] Listando todas as imagens cadastradas.');
  const imagens = await db('imagens').select('*');
  console.log(`[imagemService] Total de imagens encontradas: ${imagens.length}.`);
  return imagens;
}

export async function obterImagensPorCliente(clienteId, limite = 3) {
  if (!clienteId) {
    return [];
  }

  console.log(
    `[imagemService] Buscando até ${limite} imagem(ns) para o cliente ${clienteId} para comparação.`
  );

  const imagens = await db('imagens')
    .where({ cliente_id: clienteId })
    .orderBy('data_envio', 'desc')
    .limit(limite);

  console.log(
    `[imagemService] ${
      imagens.length > 0
        ? `Encontradas ${imagens.length} imagem(ns) para o cliente ${clienteId}.`
        : 'Nenhuma imagem encontrada para o cliente.'
    }`
  );

  return imagens;
}
