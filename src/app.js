import express from 'express';
import * as dotenv from 'dotenv';
import { processarMensagem } from './usecases/processarMensagem.js';
import {
  enviarMensagem,
  downloadMedia,
} from './services/wppconnectService.js';
import imageUploadRouter from './routes/imageUploadRouter.js';
import { normalizeWppEvent } from './utils/normalizeWppEvent.js';
import {
  obterOuCriarCliente,
  salvarMensagem,
} from './services/historicoService.js';
import { salvarImagem } from './services/imagemService.js';
import {
  obterEmbeddingDoServico,
  obterEstimativaOrcamentoPorEmbedding,
} from './utils/embedClient.js';
import { saveBase64ToUploads } from './services/mediaService.js';

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
  console.log('📥 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const normalized = normalizeWppEvent(req.body);
  console.log('🧹 Evento normalizado:', normalized);

  if (normalized.kind === 'text') {
    const telefone = normalized.phone;
    const mensagem = normalized.text;

    if (!telefone || !mensagem) {
      return res.status(400).json({ erro: 'Dados inválidos do webhook' });
    }

    try {
      const resposta = await processarMensagem(telefone, mensagem);
      await enviarMensagem(telefone, resposta);
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro ao processar mensagem:', err);
      return res.status(500).json({ erro: err.message });
    }
  }

  if (normalized.kind === 'image') {
    const telefone = normalized.phone;
    const messageId = normalized.messageId;
    let base64 = normalized.base64;
    let mimetype = normalized.mimetype;
    let filename = normalized.filename;

    if (!telefone) {
      return res.status(400).json({ erro: 'Telefone ausente no webhook de imagem' });
    }

    try {
      if (!base64 && !messageId) {
        const respostaErro =
          'Não conseguimos processar sua foto agora. Pode reenviar a imagem, por favor?';
        await enviarMensagem(telefone, respostaErro);
        return res.sendStatus(200);
      }

      if (!base64) {
        const media = await downloadMedia(messageId);
        base64 = media.base64;
        mimetype = mimetype || media.mimetype;
        filename = filename || media.filename;
      }

      if (!base64) {
        throw new Error('Não foi possível obter a mídia (base64 ausente).');
      }

      const saved = saveBase64ToUploads({ base64, mimetype, filename });
      console.log(
        '[webhook] Mídia salva localmente',
        JSON.stringify({ phone: telefone, messageId, filePath: saved.filePath })
      );

      const cliente = await obterOuCriarCliente(telefone);
      await salvarMensagem(cliente.id, '[imagem recebida]', 'entrada');
      await salvarImagem({
        clienteId: cliente.id,
        caminho: saved.relativePath,
        nomeOriginal: saved.originalName,
      });

      const embedding = await obterEmbeddingDoServico(saved.filePath);
      const estimate = await obterEstimativaOrcamentoPorEmbedding(embedding);

      console.log(
        '[webhook] Resultado da estimativa',
        JSON.stringify({
          phone: telefone,
          kind: normalized.kind,
          messageId,
          filePath: saved.filePath,
          best_match_score: estimate?.best_match_score,
          threshold_passed: estimate?.threshold_passed,
        })
      );

      const valorBruto = estimate?.suggested_value ?? estimate?.best_match_valor_ref;
      const valorNumerico = Number(valorBruto);
      const valorFormatado =
        Number.isFinite(valorNumerico) && !Number.isNaN(valorNumerico)
          ? valorNumerico.toFixed(2)
          : valorBruto || '---';

      let resposta;
      if (estimate?.threshold_passed === true && estimate?.best_match_status_faz === true) {
        resposta = `Perfeito! Pela foto, conseguimos fazer sim. O orçamento estimado fica em R$ ${valorFormatado} (podendo variar após avaliação presencial). Qual dia você consegue deixar o carro na oficina?`;
      } else {
        resposta =
          'Para esse caso, precisamos que um profissional avalie melhor. Vou encaminhar para o responsável e retornamos em seguida, tudo bem?';
      }

      await salvarMensagem(cliente.id, resposta, 'resposta');
      await enviarMensagem(telefone, resposta);

      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro no fluxo de imagem:', err.message || err);
      const respostaErro =
        'Não conseguimos processar sua foto agora. Pode reenviar a imagem, por favor?';
      try {
        await enviarMensagem(telefone, respostaErro);
      } catch (sendErr) {
        console.error('❌ Falha ao enviar mensagem de erro:', sendErr.message || sendErr);
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
