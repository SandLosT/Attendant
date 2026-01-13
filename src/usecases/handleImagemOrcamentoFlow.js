import { obterOuCriarCliente, salvarMensagem } from '../services/historicoService.js';
import { salvarImagem } from '../services/imagemService.js';
import { saveBase64ToUploads } from '../services/mediaService.js';
import {
  getOrCreateAtendimento,
  setEstadoEOrcamento,
} from '../services/atendimentoService.js';
import { criarOrcamentoParaImagem } from '../services/orcamentoService.js';
import {
  obterEmbeddingDoServico,
  obterEstimativaOrcamentoPorEmbedding,
} from '../utils/embedClient.js';
import gerarRespostaAssistente from './gerarRespostaAssistente.js';

function normalizarStatusFaz(valor) {
  return (
    valor === true ||
    valor === 1 ||
    valor === 'true' ||
    valor === '1' ||
    valor === 'faz'
  );
}

export async function handleImagemOrcamentoFlow({
  telefone,
  base64,
  mimetype,
  filename,
  sourceMessageId = null,
}) {
  if (!telefone) {
    throw new Error('Telefone é obrigatório para o fluxo de imagem.');
  }

  const cliente = await obterOuCriarCliente(telefone);
  await salvarMensagem(cliente.id, '[imagem recebida]', 'entrada');

  const saved = saveBase64ToUploads({ base64, mimetype, filename });
  console.log('[handleImagemOrcamentoFlow] Imagem salva para processamento.', {
    telefone,
    sourceMessageId,
    filePath: saved.filePath,
    relativePath: saved.relativePath,
  });

  const imagemId = await salvarImagem({
    clienteId: cliente.id,
    caminho: saved.relativePath,
    nomeOriginal: saved.originalName,
  });

  const embedding = await obterEmbeddingDoServico(saved.filePath);
  const estimate = await obterEstimativaOrcamentoPorEmbedding(embedding);

  const orcamentoId = await criarOrcamentoParaImagem({
    clienteId: cliente.id,
    imagemId,
    estimate,
  });

  await getOrCreateAtendimento(cliente.id);

  const statusFaz = normalizarStatusFaz(estimate?.best_match_status_faz);
  const passouThreshold = estimate?.threshold_passed === true;
  const atendimentoEstado = passouThreshold && statusFaz
    ? 'AGUARDANDO_DATA'
    : 'AGUARDANDO_APROVACAO_DONO';

  await setEstadoEOrcamento(cliente.id, atendimentoEstado, orcamentoId);

  const valorBruto = estimate?.suggested_value ?? estimate?.best_match_valor_ref;
  const valorNumerico = Number(valorBruto);
  const valorFormatado =
    Number.isFinite(valorNumerico) && !Number.isNaN(valorNumerico)
      ? valorNumerico.toFixed(2)
      : valorBruto || '---';

  const draft = passouThreshold && statusFaz
    ? `Pela foto, conseguimos fazer sim. O orçamento estimado fica em R$ ${valorFormatado}. Qual dia você consegue deixar o carro na oficina?`
    : 'Precisamos que um profissional avalie melhor. Vou encaminhar para o responsável e já retorno, tudo bem?';

  const resposta = await gerarRespostaAssistente({
    telefone,
    estado: atendimentoEstado,
    mensagemUsuario: '[imagem]',
    objetivo: passouThreshold && statusFaz ? 'pedir data dd/mm' : 'avisar avaliação humana',
    dados: {
      valor_estimado: valorFormatado,
      score: estimate?.best_match_score,
      status_faz: estimate?.best_match_status_faz,
      threshold_passed: estimate?.threshold_passed,
      ref_image_id: estimate?.ref_image_id,
    },
    draft,
  });

  await salvarMensagem(cliente.id, resposta, 'resposta');

  return {
    resposta,
    estimate,
    orcamentoId,
    atendimentoEstado,
    filePath: saved.filePath,
    relativePath: saved.relativePath,
  };
}
