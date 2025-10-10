import knex from "../database/index.js";

export async function salvarImagem(nomeArquivo, caminho, idUsuario, embedding) {
  return knex("imagens").insert({
    nome: nomeArquivo,
    caminho,
    usuario_id: idUsuario,
    embedding: JSON.stringify(embedding), // salva JSON
  });
}

export async function listarImagens() {
  return knex("imagens").select("*");
}
