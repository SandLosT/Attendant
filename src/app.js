import express from 'express';
import * as dotenv from 'dotenv';
import { processarMensagem } from './usecases/processarMensagem.js';
import { enviarMensagem, downloadMedia } from './services/wppconnectService.js';
import imageUploadRouter from './routes/imageUploadRouter.js';
import { normalizeWppEvent } from './utils/normalizeWppEvent.js';
import { obterOuCriarCliente, salvarMensagem } from './services/historicoService.js';

import { getAtendimentoByClienteId, setEstado } from './services/atendimentoService.js';
import { setPreferenciaData } from './services/orcamentoService.js';
import { extrairDataEPeriodo, preReservarSlot } from './services/agendaService.js';

import { handleImagemOrcamentoFlow } from './usecases/handleImagemOrcamentoFlow.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '25mb' }));
app.use('/upload', imageUploadRouter);

// Rota de teste
app.get('/', (req, res) => {
  res.send('Servidor de atendimento IA rodando');
});

// Webhook real vindo do WPPConnect
app.post('/webhook', async (req, res) => {
  console.log('📥 Webhook recebido:', {
    event: req.body?.event,
    type: req.body?.type,
    from: req.body?.from || req.body?.data?.from,
    hasBase64: Boolean(req.body?.base64 || req.body?.data?.base64),
    hasMessageId: Boolean(
      req.body?.messageId || req.body?.data?.messageId || req.body?.id
    ),
  });

  const normalized = normalizeWppEvent(req.body);
  console.log('🧹 Evento normalizado:', normalized);

  // ----------------------------
  // TEXTO
  // ----------------------------
  if (normalized.kind === 'text') {
    const telefone = normalized.phone;
    const mensagem = normalized.text;

    if (!telefone || !mensagem) {
      return res.status(400).json({ erro: 'Dados inválidos do webhook' });
    }

    try {
      const cliente = await obterOuCriarCliente(telefone);
      const atendimento = await getAtendimentoByClienteId(cliente.id);

      // Se está aguardando data, interpretamos e pré-reservamos slot
      if (atendimento?.estado === 'AGUARDANDO_DATA') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        const { data, periodo } = extrairDataEPeriodo(mensagem);

        if (data) {
          await preReservarSlot(data, periodo);
        }

        if (atendimento.orcamento_id_atual) {
          await setPreferenciaData(atendimento.orcamento_id_atual, {
            data_preferida: data,
            periodo_preferido: periodo,
          });
        }

        await setEstado(cliente.id, 'AGUARDANDO_APROVACAO_DONO');

        const respostaConfirmacao =
          'Estamos confirmando com o responsável e já te retornamos.';
        await salvarMensagem(cliente.id, respostaConfirmacao, 'resposta');
        await enviarMensagem(telefone, respostaConfirmacao);
        return res.sendStatus(200);
      }

      // Enquanto aguarda aprovação do dono, responde consistente
      if (atendimento?.estado === 'AGUARDANDO_APROVACAO_DONO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        const respostaStatus =
          'Estamos confirmando com o responsável e já te retornamos.';
        await salvarMensagem(cliente.id, respostaStatus, 'resposta');
        await enviarMensagem(telefone, respostaStatus);
        return res.sendStatus(200);
      }

      // Fluxo normal (sem state machine)
      const resposta = await processarMensagem(telefone, mensagem);
      await enviarMensagem(telefone, resposta);
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro ao processar mensagem:', err);
      return res.status(500).json({ erro: err.message });
    }
  }

  // ----------------------------
  // IMAGEM
  // ----------------------------
  if (normalized.kind === 'image') {
    const telefone = normalized.phone;
    const messageId = normalized.messageId;
    let base64 = normalized.base64;
    let mimetype = normalized.mimetype;
    let filename = normalized.filename;

    if (!telefone) {
      return res
        .status(400)
        .json({ erro: 'Telefone ausente no webhook de imagem' });
    }

    try {
      // Hardening: se não veio base64 e não veio messageId, não tem como baixar mídia
      if (!base64 && !messageId) {
        const respostaErro =
          'Não conseguimos processar sua foto agora. Pode reenviar a imagem, por favor?';
        await enviarMensagem(telefone, respostaErro);
        return res.sendStatus(200);
      }

      // Se não veio base64, baixa do WPPConnect
      if (!base64) {
        const media = await downloadMedia(messageId);
        base64 = media.base64;
        mimetype = mimetype || media.mimetype;
        filename = filename || media.filename;
      }

      if (!base64) {
        throw new Error('Não foi possível obter a mídia (base64 ausente).');
      }

      // Fluxo unificado: salva imagem, estima, cria orçamento/atendimento, grava histórico e retorna resposta
      const resultado = await handleImagemOrcamentoFlow({
        telefone,
        base64,
        mimetype,
        filename,
        sourceMessageId: messageId,
      });

      await enviarMensagem(telefone, resultado.resposta);
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro no fluxo de imagem:', err.message || err);
      const respostaErro =
        'Não conseguimos processar sua foto agora. Pode reenviar a imagem, por favor?';
      try {
        await enviarMensagem(telefone, respostaErro);
      } catch (sendErr) {
        console.error(
          '❌ Falha ao enviar mensagem de erro:',
          sendErr.message || sendErr
        );
      }
      return res.status(500).json({ erro: err.message });
    }
  }

  return res.status(200).json({ info: 'Evento ignorado' });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
