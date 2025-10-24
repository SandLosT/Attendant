import { gerarRespostaComImagem } from '../services/openaiService.js';
import {
  obterOuCriarCliente,
  salvarMensagem,
  obterUltimasMensagens
} from '../services/historicoService.js';
import { obterInfoLoja } from '../services/lojaService.js';
import { obterImagensPorCliente } from '../services/imagemService.js';

export async function processarMensagem(telefone, mensagem) {
  const cliente = await obterOuCriarCliente(telefone);
  await salvarMensagem(cliente.id, mensagem, 'entrada');

  const historico = await obterUltimasMensagens(cliente.id);
  const loja = await obterInfoLoja();
  if (!loja) {
    throw new Error('Informações da loja não foram configuradas.');
  }

  const imagens = await obterImagensPorCliente(cliente.id);

  const contextoHistorico = historico
    .reverse()
    .map((msg) => `${msg.tipo === 'entrada' ? 'Cliente' : 'Atendente'}: ${msg.mensagem}`)
    .join('\n');

  const telefoneLoja = loja.telefone || loja.telefone_loja || 'Não informado';
  const tabelaPrecos = loja.politicas_preco ? JSON.stringify(loja.politicas_preco) : 'Não informado';

  const contextoLoja = `
📄 Informações da oficina:
- Nome: ${loja.nome}
- Descrição: ${loja.descricao}
- Serviços oferecidos: ${loja.servicos}
- Horário de atendimento: ${loja.horario_atendimento}
- Endereço: ${loja.endereco || 'Não informado'}
- Telefone da loja: ${telefoneLoja}
- Redes sociais (Instagram, se disponível): ${loja.instagram || 'Não informado'}
- Tabela de preços: ${tabelaPrecos}
`;

  const imagensMaisRecentes =
    imagens.length > 0
      ? imagens
          .map(
            (img, i) =>
              `Imagem ${i + 1}: ${img.nome_original || 'sem nome'} (hash: ${img.hash || 'sem hash'})`
          )
          .join('\n')
      : 'Nenhuma imagem recebida.';

  const prompt = `
Você é um atendente da oficina ${loja.nome}, especializado em responder clientes pelo WhatsApp.

📌 Responda exclusivamente com base nas informações abaixo da oficina.
🚫 **Nunca invente nomes, endereços, serviços, redes sociais ou preços.**
✅ Se o cliente pedir algo que **não está nos serviços listados**, diga gentilmente que **não oferecemos esse serviço no momento**.
🔍 Se a pergunta não for sobre os serviços da loja, responda de forma neutra ou genérica (ex: elogios, saudações, dúvidas pessoais).
📷 Se o cliente já enviou imagens, leve isso em consideração para a resposta.

${contextoLoja}

📚 Histórico de conversa:
${contextoHistorico}

🖼️ Imagens mais recentes enviadas pelo cliente:
${imagensMaisRecentes}

📥 Nova mensagem do cliente: "${mensagem}"

Responda de forma objetiva, cordial e sem repetir o que já foi dito.
Não use frases genéricas como "sou uma IA" ou "não tenho essas informações".
`;

  const resposta = await gerarRespostaComImagem(prompt.trim());
  await salvarMensagem(cliente.id, resposta, 'resposta');
  return resposta;
}
