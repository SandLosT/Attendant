import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { processarMensagem } from './usecases/processarMensagem.js';
import { enviarMensagem, downloadMedia } from './services/wppconnectService.js';
import imageUploadRouter from './routes/imageUploadRouter.js';
import ownerRouter from './routes/ownerRouter.js';
import ownerAgendaRouter from './routes/ownerAgendaRouter.js';
import { normalizeWppEvent } from './utils/normalizeWppEvent.js';
import { obterOuCriarCliente, salvarMensagem } from './services/historicoService.js';
import { salvarImagem } from './services/imagemService.js';
import { saveBase64ToUploads } from './services/mediaService.js';

import {
  getAtendimentoByClienteId,
  getOrCreateAtendimento,
  isManualAtivo,
  setEstado,
} from './services/atendimentoService.js';

import { setPreferenciaData } from './services/orcamentoService.js';

import {
  extrairDataEPeriodo,
  findProximaVagaAPartir,
  normalizarPeriodo,
  preReservarSlot,
} from './services/agendaService.js';

import { handleImagemOrcamentoFlow } from './usecases/handleImagemOrcamentoFlow.js';
import { gerarRespostaHumanizada } from './services/assistantReplyService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDistPath = path.resolve(__dirname, '../pwa-owner/dist');
const WEBHOOK_DEDUPE_TTL_MS = Number(process.env.WEBHOOK_DEDUPE_TTL_MS) || 120000;
const HASH_DEDUPE_TTL_MS = 30000;
const webhookDedupe = new Map();
const webhookHashDedupe = new Map();

const NOVO_ORCAMENTO_TERMOS = [
  'novo',
  'outro',
  'orçamento',
  'orcamento',
  'foto',
  'amassado',
  'cotação',
  'cotacao',
];

function contemNovoOrcamento(texto = '') {
  const textoNormalizado = texto.toLowerCase();
  return NOVO_ORCAMENTO_TERMOS.some((termo) => textoNormalizado.includes(termo));
}

function formatarDataBr(isoDate) {
  if (!isoDate) return '';
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}`;
}

function adicionarDiasISO(isoDate, dias) {
  const [ano, mes, dia] = isoDate.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  data.setDate(data.getDate() + dias);
  const year = data.getFullYear();
  const month = String(data.getMonth() + 1).padStart(2, '0');
  const day = String(data.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compat: se preReservarSlot retornar boolean (versão antiga),
 * converte para { ok: boolean }. Se retornar objeto, mantém.
 */
function normalizarResultadoReserva(ret) {
  if (typeof ret === 'boolean') {
    return ret ? { ok: true } : { ok: false, reason: 'INDISPONIVEL' };
  }
  if (ret && typeof ret === 'object' && 'ok' in ret) {
    if (ret.ok) {
      return ret;
    }
    return { ...ret, reason: ret.reason || 'INDISPONIVEL' };
  }
  return { ok: false };
}

app.use(express.json({ limit: '25mb' }));
app.use('/upload', imageUploadRouter);
app.use('/owner/agenda', ownerAgendaRouter);
app.use('/owner', ownerRouter);

if (fs.existsSync(pwaDistPath)) {
  app.use('/pwa', express.static(pwaDistPath));
  app.get(['/pwa', '/pwa/*'], (req, res) => {
    res.sendFile(path.join(pwaDistPath, 'index.html'));
  });
}

app.get('/', (req, res) => {
  res.send('Servidor de atendimento IA rodando');
});

app.post('/webhook', async (req, res) => {
  const normalized = normalizeWppEvent(req.body);
  const hasBase64 = Boolean(req.body?.base64 || req.body?.data?.base64);
  const hasMessageId = Boolean(normalized.messageId);

  console.log('📥 Webhook recebido:', {
    event: normalized.event,
    phone: normalized.phone,
    messageId: normalized.messageId,
    hasBase64,
    hasMessageId,
  });

  const now = Date.now();
  for (const [key, timestamp] of webhookDedupe.entries()) {
    if (now - timestamp > WEBHOOK_DEDUPE_TTL_MS) {
      webhookDedupe.delete(key);
    }
  }
  for (const [key, timestamp] of webhookHashDedupe.entries()) {
    if (now - timestamp > HASH_DEDUPE_TTL_MS) {
      webhookHashDedupe.delete(key);
    }
  }

  if (normalized.event !== 'onmessage') {
    console.log('🛑 Webhook ignorado:', { ignored: 'not_onmessage' });
    return res.status(200).json({ info: 'ignored', reason: 'not_onmessage' });
  }

  if (normalized.fromMe === true) {
    console.log('🛑 Webhook ignorado:', { ignored: 'fromMe' });
    return res.status(200).json({ info: 'ignored', reason: 'fromMe' });
  }

  if (normalized.messageId) {
    const lastSeen = webhookDedupe.get(normalized.messageId);
    if (lastSeen && now - lastSeen < WEBHOOK_DEDUPE_TTL_MS) {
      console.log('🛑 Webhook ignorado:', { ignored: 'duplicate' });
      return res.status(200).json({ info: 'ignored', reason: 'duplicate' });
    }
    webhookDedupe.set(normalized.messageId, now);
  } else {
    const text = normalized.text || '';
    const base64Length = normalized.base64 ? normalized.base64.length : 0;
    const hashKey = `${normalized.phone}|${normalized.kind}|${text}|${base64Length}`;
    const lastSeen = webhookHashDedupe.get(hashKey);
    if (lastSeen && now - lastSeen < HASH_DEDUPE_TTL_MS) {
      console.log('🛑 Webhook ignorado:', { ignored: 'duplicate' });
      return res.status(200).json({ info: 'ignored', reason: 'duplicate' });
    }
    webhookHashDedupe.set(hashKey, now);
  }

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
      const atendimento = await getOrCreateAtendimento(cliente.id);
      const modoManualAtivo = isManualAtivo(atendimento);

      // Dono assumiu: bot não responde
      if (modoManualAtivo) {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        return res.status(200).json({ ok: true, manual: true });
      }

      // Atendimento finalizado: só volta a falar se cliente indicar "novo orçamento"
      if (atendimento?.estado === 'FINALIZADO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (contemNovoOrcamento(mensagem)) {
          await setEstado(cliente.id, 'AGUARDANDO_FOTO');
          const respostaNovoOrcamento = await gerarRespostaHumanizada({
            estado: 'AGUARDANDO_FOTO',
            mensagemUsuario: mensagem,
            dadosOrcamento: { acao: 'pedir_foto' },
            clienteTelefone: telefone,
          });
          await salvarMensagem(cliente.id, respostaNovoOrcamento, 'resposta');
          await enviarMensagem(telefone, respostaNovoOrcamento);
        } else {
          const respostaFinalizado = await gerarRespostaHumanizada({
            estado: 'FINALIZADO',
            mensagemUsuario: mensagem,
            dadosOrcamento: { acao: 'finalizado' },
            clienteTelefone: telefone,
          });
          await salvarMensagem(cliente.id, respostaFinalizado, 'resposta');
          await enviarMensagem(telefone, respostaFinalizado);
        }

        return res.sendStatus(200);
      }

      if (atendimento?.estado === 'AGUARDANDO_FOTO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        const respostaFoto = await gerarRespostaHumanizada({
          estado: 'AGUARDANDO_FOTO',
          mensagemUsuario: mensagem,
          dadosOrcamento: { acao: 'pedir_foto' },
          clienteTelefone: telefone,
        });
        await salvarMensagem(cliente.id, respostaFoto, 'resposta');
        await enviarMensagem(telefone, respostaFoto);
        return res.sendStatus(200);
      }

      // ----------------------------
      // AGUARDANDO_DATA
      // ----------------------------
      if (atendimento?.estado === 'AGUARDANDO_DATA') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        const { data, periodo } = extrairDataEPeriodo(mensagem);
        const periodoPreferido = normalizarPeriodo(periodo);

        if (!data) {
          const respostaData = await gerarRespostaHumanizada({
            estado: 'AGUARDANDO_DATA',
            mensagemUsuario: mensagem,
            dadosOrcamento: { acao: 'pedir_data' },
            clienteTelefone: telefone,
          });
          await salvarMensagem(cliente.id, respostaData, 'resposta');
          await enviarMensagem(telefone, respostaData);
          return res.sendStatus(200);
        }

        // Tenta reservar: se o cliente pediu um período, tenta ele e depois o outro; senão tenta MANHA e TARDE
        const periodosTentativa = periodoPreferido
          ? [periodoPreferido, periodoPreferido === 'MANHA' ? 'TARDE' : 'MANHA']
          : ['MANHA', 'TARDE'];

        let periodoReservado = null;
        let resultadoReserva = null;

        for (const periodoTentativa of periodosTentativa) {
          const ret = await preReservarSlot(data, periodoTentativa);
          resultadoReserva = normalizarResultadoReserva(ret);

          if (resultadoReserva.ok) {
            periodoReservado = periodoTentativa;
            break;
          }

          // Semana cheia -> sugere próxima vaga real
          if (resultadoReserva.reason === 'SEMANA_CHEIA') {
            const sugestao = await findProximaVagaAPartir(data, periodoPreferido);
            if (sugestao) {
              const respostaSemanaCheia = await gerarRespostaHumanizada({
                estado: 'AGUARDANDO_DATA',
                mensagemUsuario: mensagem,
                dadosOrcamento: {
                  acao: 'sugerir_vaga',
                  dataBr: formatarDataBr(sugestao.data),
                  periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
                },
                clienteTelefone: telefone,
              });
              await salvarMensagem(cliente.id, respostaSemanaCheia, 'resposta');
              await enviarMensagem(telefone, respostaSemanaCheia);
              return res.sendStatus(200);
            }

            const respostaSemanaCheia = await gerarRespostaHumanizada({
              estado: 'AGUARDANDO_DATA',
              mensagemUsuario: mensagem,
              dadosOrcamento: { acao: 'semana_cheia' },
              clienteTelefone: telefone,
            });
            await salvarMensagem(cliente.id, respostaSemanaCheia, 'resposta');
            await enviarMensagem(telefone, respostaSemanaCheia);
            return res.sendStatus(200);
          }
        }

        // Não reservou em nenhum período -> tenta sugerir a próxima vaga a partir do dia seguinte
        if (!resultadoReserva?.ok || !periodoReservado) {
          const proximaData = adicionarDiasISO(data, 1);
          const sugestao = await findProximaVagaAPartir(proximaData, periodoPreferido);

          if (sugestao) {
            const respostaIndisponivel = await gerarRespostaHumanizada({
              estado: 'AGUARDANDO_DATA',
              mensagemUsuario: mensagem,
              dadosOrcamento: {
                acao: 'sugerir_vaga',
                dataBr: formatarDataBr(sugestao.data),
                periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
              },
              clienteTelefone: telefone,
            });
            await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
            await enviarMensagem(telefone, respostaIndisponivel);
            return res.sendStatus(200);
          }

          const respostaIndisponivel = await gerarRespostaHumanizada({
            estado: 'AGUARDANDO_DATA',
            mensagemUsuario: mensagem,
            dadosOrcamento: { acao: 'indisponivel' },
            clienteTelefone: telefone,
          });
          await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
          await enviarMensagem(telefone, respostaIndisponivel);
          return res.sendStatus(200);
        }

        // Reservou com sucesso
        await setPreferenciaData(atendimento.orcamento_id_atual, {
          data_preferida: data,
          periodo_preferido: periodoReservado,
        });

        await setEstado(cliente.id, 'AGUARDANDO_APROVACAO_DONO');

        const periodoTxt = periodoReservado === 'TARDE' ? 'tarde' : 'manhã';
        const respostaConfirmacao = await gerarRespostaHumanizada({
          estado: 'AGUARDANDO_DATA',
          mensagemUsuario: mensagem,
          dadosOrcamento: {
            acao: 'confirmar_pre_reserva',
            dataBr: formatarDataBr(data),
            periodoTxt,
          },
          clienteTelefone: telefone,
        });

        await salvarMensagem(cliente.id, respostaConfirmacao, 'resposta');
        await enviarMensagem(telefone, respostaConfirmacao);

        return res.sendStatus(200);
      }

      // Enquanto aguarda aprovação do dono
      if (atendimento?.estado === 'AGUARDANDO_APROVACAO_DONO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        const respostaStatus = await gerarRespostaHumanizada({
          estado: 'AGUARDANDO_APROVACAO_DONO',
          mensagemUsuario: mensagem,
          dadosOrcamento: { acao: 'aguardando_aprovacao' },
          clienteTelefone: telefone,
        });
        await salvarMensagem(cliente.id, respostaStatus, 'resposta');
        await enviarMensagem(telefone, respostaStatus);
        return res.sendStatus(200);
      }

      // Fluxo normal
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
      return res.status(400).json({ erro: 'Telefone ausente no webhook de imagem' });
    }

    try {
      const cliente = await obterOuCriarCliente(telefone);
      const atendimento = await getAtendimentoByClienteId(cliente.id);
      const modoManualAtivo = isManualAtivo(atendimento);

      // Modo manual: registra mas não responde
      if (modoManualAtivo) {
        await salvarMensagem(cliente.id, '[imagem recebida]', 'entrada');

        if (!base64 && messageId) {
          const media = await downloadMedia(messageId);
          base64 = media.base64;
          mimetype = mimetype || media.mimetype;
          filename = filename || media.filename;
        }

        if (base64) {
          const saved = saveBase64ToUploads({ base64, mimetype, filename });
          await salvarImagem({
            clienteId: cliente.id,
            caminho: saved.relativePath,
            nomeOriginal: saved.originalName,
          });
        }

        return res.status(200).json({ ok: true, manual: true });
      }

      // Se estava finalizado e mandou foto, inicia novo ciclo
      if (atendimento?.estado === 'FINALIZADO') {
        await setEstado(cliente.id, 'AGUARDANDO_FOTO');
      }

      // Hardening: precisa base64 ou messageId
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
        console.error('❌ Falha ao enviar mensagem de erro:', sendErr.message || sendErr);
      }
      return res.status(500).json({ erro: err.message });
    }
  }

  return res.status(200).json({ info: 'Evento ignorado' });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});

/*
Testes manuais:
1) Fechar manual → cliente manda “oi” → bot fica mudo.
2) Cliente manda “novo orçamento” → bot pede foto.
3) Cliente manda foto → pipeline roda.
*/
