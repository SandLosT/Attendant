import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL || "http://localhost:8001";

export async function obterEmbeddingDoServico(caminhoImagem) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(caminhoImagem));

  try {
    const res = await axios.post(`${EMBED_SERVICE_URL}/embed`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return res.data.embedding;
  } catch (err) {
    console.error("Erro ao obter embedding:", err.message);
    throw err;
  }
}
