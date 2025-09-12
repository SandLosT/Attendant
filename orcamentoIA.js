import { gerarResposta } from './openaiService.js';

export async function gerarRespostaComImagem(contextoHistorico, dadosLoja, imagens = []) {
  const contextoLoja = `
Oficina: ${dadosLoja.nome}
Serviços oferecidos: ${dadosLoja.servicos}
Preços: ${dadosLoja.politicas_preco}
`;

  const listaImagens = imagens.map((img, i) => `Imagem ${i + 1}: ${img.nome_original}`).join('\n');

  const prompt = `
Você é um atendente especializado. Use apenas as informações fornecidas abaixo para dar estimativas precisas.

${contextoLoja}

Histórico da conversa:
${contextoHistorico}

Imagens recebidas:
${listaImagens || 'Nenhuma'}

Gere uma resposta clara, sem repetir, e com base no que a oficina oferece. Se for um serviço não oferecido, diga isso claramente.
`;

  return await gerarResposta(prompt.trim());
}
