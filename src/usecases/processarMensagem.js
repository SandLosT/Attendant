import { gerarRespostaHumana, openAIKeyDisponivel } from '../services/openaiService.js';
import {
  obterOuCriarCliente,
  salvarMensagem,
  obterUltimasMensagens
} from '../services/historicoService.js';
import { obterInfoLoja } from '../services/lojaService.js';
import { obterImagensPorCliente } from '../services/imagemService.js';

export async function processarMensagem(telefone, mensagem) {
  console.log(
    '[processarMensagem] Iniciando processamento da mensagem:',
    JSON.stringify({ telefone, trechoMensagem: mensagem?.slice(0, 120) })
  );
  const cliente = await obterOuCriarCliente(telefone);
  console.log('[processarMensagem] Cliente localizado:', cliente?.id);
  await salvarMensagem(cliente.id, mensagem, 'entrada');
  console.log('[processarMensagem] Mensagem de entrada registrada no histórico.');

  const historico = await obterUltimasMensagens(cliente.id);
  console.log(
    `[processarMensagem] Histórico recuperado com ${historico.length} mensagens para o cliente ${cliente.id}.`
  );
  const loja = await obterInfoLoja();
  if (!loja) {
    throw new Error('Informações da loja não foram configuradas.');
  }
  console.log('[processarMensagem] Informações da loja carregadas com sucesso.');

  const imagens = await obterImagensPorCliente(cliente.id);
  if (imagens.length > 0) {
    console.log(
      `[processarMensagem] Foram encontradas ${imagens.length} imagem(ns) recentes para comparação.`
    );
  } else {
    console.log('[processarMensagem] Nenhuma imagem anterior encontrada para este cliente.');
  }

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

  if (!openAIKeyDisponivel()) {
    const respostaPadrao =
      'Obrigada pela mensagem! Já vou verificar e te respondo em instantes. Como posso te ajudar hoje?';
    await salvarMensagem(cliente.id, respostaPadrao, 'resposta');
    console.log('[processarMensagem] OpenAI sem chave; resposta padrão registrada.');
    return respostaPadrao;
  }

  const resposta = await gerarRespostaHumana({
    telefone,
    mensagem,
    contexto: {
      loja: contextoLoja,
      historico: contextoHistorico,
      imagens: imagensMaisRecentes,
      estadoAtendimento: 'Não informado',
    },
  });
  const respostaFinal = resposta?.ok ? resposta.content : '';
  if (!respostaFinal) {
    const respostaPadrao =
      'Obrigada pela mensagem! Já vou verificar e te respondo em instantes. Como posso te ajudar hoje?';
    await salvarMensagem(cliente.id, respostaPadrao, 'resposta');
    console.log('[processarMensagem] OpenAI indisponível; resposta padrão registrada.');
    return respostaPadrao;
  }

  console.log('[processarMensagem] Resposta gerada pela OpenAI. Persistindo no histórico.');
  await salvarMensagem(cliente.id, respostaFinal, 'resposta');
  console.log('[processarMensagem] Resposta registrada no histórico. Processo concluído.');
  return respostaFinal;
}
