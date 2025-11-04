import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL || "http://localhost:8001";

export async function obterEmbeddingDoServico(caminhoImagem) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(caminhoImagem));

  try {
    console.log(
      '[embedClient] Enviando imagem para serviço de embedding:',
      JSON.stringify({ caminhoImagem, url: `${EMBED_SERVICE_URL}/embed` })
    );
    const res = await axios.post(`${EMBED_SERVICE_URL}/embed`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    console.log('[embedClient] Embedding recebido do serviço com sucesso.');
    return res.data.embedding;
  } catch (err) {
    console.error("Erro ao obter embedding:", err.message);
    throw err;
  }
}

export async function obterEstimativaOrcamentoPorEmbedding(embedding, topK = 5) {
  try {
    console.log(
      '[embedClient] Solicitando estimativa de orçamento com embedding e topK:',
      JSON.stringify({ topK, url: `${EMBED_SERVICE_URL}/estimate` })
    );
    const res = await axios.post(`${EMBED_SERVICE_URL}/estimate`, {
      embedding,
      top_k: topK,
    });
    console.log('[embedClient] Estimativa recebida do serviço de embeddings.');
    return res.data;
  } catch (err) {
    console.error("Erro ao obter estimativa de orçamento:", err.message);
    throw err;
  }
}
