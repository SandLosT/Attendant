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
  ESTADO_EM_CONVERSA,
} from './services/atendimentoService.js';

import { setPreferenciaData } from './services/orcamentoService.js';

import {
  extrairDataEPeriodo,
  findProximaVagaAPartir,
  normalizarPeriodo,
  preReservarSlot,
} from './services/agendaService.js';

import { handleImagemOrcamentoFlow } from './usecases/handleImagemOrcamentoFlow.js';
import { gerarRespostaAssistente } from './services/assistantReplyService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const OWNER_APP_ORIGIN = process.env.OWNER_APP_ORIGIN || '';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDistPath = path.resolve(__dirname, '../pwa-owner/dist');
const WEBHOOK_DEDUPE_TTL_MS = Number(process.env.WEBHOOK_DEDUPE_TTL_MS) || 120000;
const HASH_DEDUPE_TTL_MS = 30000;
const webhookDedupe = new Map();
const webhookHashDedupe = new Map();

const TERMOS_INTENCAO_ORCAMENTO = [
  'orçamento',
  'orcamento',
  'amassado',
  'batida',
  'arrumar',
  'martelinho',
  'quanto custa',
  'preço',
  'preco',
  'valor',
  'cotação',
  'cotacao',
  'paralama',
  'porta',
  'capô',
  'capo',
  'carro',
];

const TERMOS_CUMPRIMENTO = [
  'oi',
  'ola',
  'olá',
  'olar',
  'bom dia',
  'boa tarde',
  'boa noite',
  'opa',
  'e ai',
  'e aí',
];

const TERMOS_CANCELAMENTO_ORCAMENTO = [
  'nao quero',
  'não quero',
  'não precisa',
  'nao precisa',
  'deixa',
  'sem orçamento',
  'sem orcamento',
];

function normalizarTexto(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function temIntencaoOrcamento(texto = '') {
  const textoNormalizado = normalizarTexto(texto);
  return TERMOS_INTENCAO_ORCAMENTO.some((termo) => textoNormalizado.includes(normalizarTexto(termo)));
}

function mensagemEhSoCumprimento(texto = '') {
  const textoNormalizado = normalizarTexto(texto).replace(/[!?.;,]/g, '').trim();
  if (!textoNormalizado) {
    return false;
  }
  return TERMOS_CUMPRIMENTO.includes(textoNormalizado);
}

function contemCancelamentoOrcamento(texto = '') {
  const textoNormalizado = normalizarTexto(texto);
  return TERMOS_CANCELAMENTO_ORCAMENTO.some((termo) => textoNormalizado.includes(normalizarTexto(termo)));
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

function shouldIgnoreWebhook(normalized) {
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

  if (normalized.event && normalized.event !== 'onmessage') {
    return { ignore: true, reason: 'not_onmessage' };
  }

  if (normalized.fromMe === true) {
    return { ignore: true, reason: 'fromMe' };
  }

  if (normalized.messageId) {
    const lastSeen = webhookDedupe.get(normalized.messageId);
    if (lastSeen && now - lastSeen < WEBHOOK_DEDUPE_TTL_MS) {
      return { ignore: true, reason: 'duplicate' };
    }
    webhookDedupe.set(normalized.messageId, now);
    return { ignore: false };
  }

  const text = normalized.text || '';
  const base64Length = normalized.base64 ? normalized.base64.length : 0;
  const hashKey = `${normalized.phone}|${normalized.kind}|${text}|${base64Length}`;
  const lastSeen = webhookHashDedupe.get(hashKey);
  if (lastSeen && now - lastSeen < HASH_DEDUPE_TTL_MS) {
    return { ignore: true, reason: 'duplicate' };
  }
  webhookHashDedupe.set(hashKey, now);
  return { ignore: false };
}

app.use((req, res, next) => {
  if (!OWNER_APP_ORIGIN) {
    return next();
  }

  const origin = req.headers.origin;
  if (origin && origin === OWNER_APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
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

  const ignoreResult = shouldIgnoreWebhook(normalized);
  if (ignoreResult.ignore) {
    console.log('🛑 Webhook ignorado:', { ignored: ignoreResult.reason });
    return res.status(200).json({ ok: true, ignored: ignoreResult.reason });
  }

  // ✅ Evita loop: ignora mensagens enviadas pelo próprio WhatsApp da sessão (fromMe)
  if (normalized.fromMe) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'fromMe' });
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
      let atendimento = await getAtendimentoByClienteId(cliente.id);
      const estadoEfetivo = atendimento?.estado === 'AGUARDANDO_FOTO' ? ESTADO_EM_CONVERSA : atendimento?.estado;
      const modoManualAtivo = isManualAtivo(atendimento);

      // Dono assumiu: bot não responde
      if (modoManualAtivo) {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        return res.status(200).json({ ok: true, manual: true });
      }

      if (!atendimento) {
        if (temIntencaoOrcamento(mensagem) && !contemCancelamentoOrcamento(mensagem)) {
          atendimento = await getOrCreateAtendimento(cliente.id);
        }

        const respostaInicial = await processarMensagem(telefone, mensagem);
        await enviarMensagem(telefone, respostaInicial);
        return res.sendStatus(200);
      }

      // Atendimento finalizado: só volta ao fluxo de orçamento se cliente indicar novo orçamento
      if (estadoEfetivo === 'FINALIZADO') {
        if (temIntencaoOrcamento(mensagem) && !contemCancelamentoOrcamento(mensagem)) {
          await setEstado(cliente.id, ESTADO_EM_CONVERSA);
          const respostaNovoOrcamento = await processarMensagem(telefone, mensagem);
          await enviarMensagem(telefone, respostaNovoOrcamento);
          return res.sendStatus(200);
        }

        await salvarMensagem(cliente.id, mensagem, 'entrada');
        const respostaFinalizado = await gerarRespostaAssistente({
          estado: 'FINALIZADO',
          mensagemCliente: mensagem,
          objetivo: 'atendimento finalizado',
          dados: {
            acao: 'finalizado',
          },
        });
        await salvarMensagem(cliente.id, respostaFinalizado, 'resposta');
        await enviarMensagem(telefone, respostaFinalizado);
        return res.sendStatus(200);
      }

      // Compatibilidade: AGUARDANDO_FOTO é tratado como conversa aberta.

      // ----------------------------
      // AGUARDANDO_DATA
      // ----------------------------
      if (estadoEfetivo === 'AGUARDANDO_DATA') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (contemCancelamentoOrcamento(mensagem)) {
          await setEstado(cliente.id, ESTADO_EM_CONVERSA);
          const respostaCancelamento = await gerarRespostaAssistente({
            estado: ESTADO_EM_CONVERSA,
            mensagemCliente: mensagem,
            objetivo: 'cancelamento de orçamento',
            dados: {
              acao: 'cancelar_orcamento',
            },
          });
          await salvarMensagem(cliente.id, respostaCancelamento, 'resposta');
          await enviarMensagem(telefone, respostaCancelamento);
          return res.sendStatus(200);
        }

        const { data, periodo } = extrairDataEPeriodo(mensagem);
        const periodoPreferido = normalizarPeriodo(periodo);

        if (!data) {
          const respostaData = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_DATA',
            mensagemCliente: mensagem,
            objetivo: 'pedir data',
            dados: {
              acao: 'pedir_data',
            },
          });
          await salvarMensagem(cliente.id, respostaData, 'resposta');
          await enviarMensagem(telefone, respostaData);
          return res.sendStatus(200);
        }

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

          if (resultadoReserva.reason === 'SEMANA_CHEIA') {
            const sugestao = await findProximaVagaAPartir(data, periodoPreferido);
            if (sugestao) {
              const respostaSemanaCheia = await gerarRespostaAssistente({
                estado: 'AGUARDANDO_DATA',
                mensagemCliente: mensagem,
                objetivo: 'sugerir vaga',
                dados: {
                  acao: 'sugerir_vaga',
                  dataBr: formatarDataBr(sugestao.data),
                  periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
                },
              });
              await salvarMensagem(cliente.id, respostaSemanaCheia, 'resposta');
              await enviarMensagem(telefone, respostaSemanaCheia);
              return res.sendStatus(200);
            }

            const respostaSemanaCheia = await gerarRespostaAssistente({
              estado: 'AGUARDANDO_DATA',
              mensagemCliente: mensagem,
              objetivo: 'semana cheia',
              dados: {
                acao: 'semana_cheia',
              },
            });
            await salvarMensagem(cliente.id, respostaSemanaCheia, 'resposta');
            await enviarMensagem(telefone, respostaSemanaCheia);
            return res.sendStatus(200);
          }
        }

        if (!resultadoReserva?.ok || !periodoReservado) {
          const proximaData = adicionarDiasISO(data, 1);
          const sugestao = await findProximaVagaAPartir(proximaData, periodoPreferido);

          if (sugestao) {
            const respostaIndisponivel = await gerarRespostaAssistente({
              estado: 'AGUARDANDO_DATA',
              mensagemCliente: mensagem,
              objetivo: 'sugerir vaga',
              dados: {
                acao: 'sugerir_vaga',
                dataBr: formatarDataBr(sugestao.data),
                periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
              },
            });
            await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
            await enviarMensagem(telefone, respostaIndisponivel);
            return res.sendStatus(200);
          }

          const respostaIndisponivel = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_DATA',
            mensagemCliente: mensagem,
            objetivo: 'indisponivel',
            dados: {
              acao: 'indisponivel',
            },
          });
          await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
          await enviarMensagem(telefone, respostaIndisponivel);
          return res.sendStatus(200);
        }

        await setPreferenciaData(atendimento.orcamento_id_atual, {
          data_preferida: data,
          periodo_preferido: periodoReservado,
        });

        await setEstado(cliente.id, 'AGUARDANDO_APROVACAO_DONO');

        const periodoTxt = periodoReservado === 'TARDE' ? 'tarde' : 'manhã';
        const respostaConfirmacao = await gerarRespostaAssistente({
          estado: 'AGUARDANDO_DATA',
          mensagemCliente: mensagem,
          objetivo: 'confirmar pré-reserva',
          dados: {
            acao: 'confirmar_pre_reserva',
            dataBr: formatarDataBr(data),
            periodoTxt,
          },
        });

        await salvarMensagem(cliente.id, respostaConfirmacao, 'resposta');
        await enviarMensagem(telefone, respostaConfirmacao);

        return res.sendStatus(200);
      }

      if (estadoEfetivo === 'AGUARDANDO_APROVACAO_DONO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (temIntencaoOrcamento(mensagem)) {
          const respostaNovoOrcamento = await processarMensagem(telefone, mensagem);
          await enviarMensagem(telefone, respostaNovoOrcamento);
          return res.sendStatus(200);
        }

        const respostaStatus = await gerarRespostaAssistente({
          estado: 'AGUARDANDO_APROVACAO_DONO',
          mensagemCliente: mensagem,
          objetivo: 'aguardar aprovação do responsável',
          dados: {
            acao: 'aguardando_aprovacao',
          },
        });
        await salvarMensagem(cliente.id, respostaStatus, 'resposta');
        await enviarMensagem(telefone, respostaStatus);
        return res.sendStatus(200);
      }

      if (
        estadoEfetivo === ESTADO_EM_CONVERSA
        || estadoEfetivo === 'AUTO'
        || estadoEfetivo === 'LIVRE'
      ) {
        const respostaLivre = await processarMensagem(telefone, mensagem);
        await enviarMensagem(telefone, respostaLivre);
        return res.sendStatus(200);
      }

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

      // Se estava finalizado e mandou foto, inicia novo ciclo em estado aberto
      if (atendimento?.estado === 'FINALIZADO') {
        await setEstado(cliente.id, ESTADO_EM_CONVERSA);
      }

      // Hardening: precisa base64 ou messageId
      if (!base64 && !messageId) {
        const respostaErro = await gerarRespostaAssistente({
          estado: ESTADO_EM_CONVERSA,
          mensagemCliente: '[erro ao receber foto]',
          objetivo: 'pedir foto',
          dados: { motivo: 'midia_ausente' },
        });
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
      const respostaErro = await gerarRespostaAssistente({
        estado: ESTADO_EM_CONVERSA,
        mensagemCliente: '[erro ao processar foto]',
        objetivo: 'pedir foto',
        dados: { motivo: 'erro_processamento' },
      });
      try {
        await enviarMensagem(telefone, respostaErro);
      } catch (sendErr) {
        console.error('❌ Falha ao enviar mensagem de erro:', sendErr.message || sendErr);
      }
      return res.status(500).json({ erro: err.message });
    }
  }

  return res.status(200).json({ ok: true, ignored: 'unsupported_kind' });
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
