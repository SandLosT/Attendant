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
  setEstadoEOrcamento,
  ESTADO_EM_CONVERSA,
} from './services/atendimentoService.js';

import { orcamentoPareceValido, setPreferenciaData } from './services/orcamentoService.js';

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

// PWA (se existir dist)
const pwaDistPath = path.resolve(__dirname, '../pwa-owner/dist');

// Dedupe anti-loop
const WEBHOOK_DEDUPE_TTL_MS = Number(process.env.WEBHOOK_DEDUPE_TTL_MS) || 120000;
const HASH_DEDUPE_TTL_MS = 30000;
const webhookDedupe = new Map();
const webhookHashDedupe = new Map();

// ---------- Regras de intenção ----------
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
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function temIntencaoOrcamento(texto = '') {
  const t = normalizarTexto(texto);
  return TERMOS_INTENCAO_ORCAMENTO.some((termo) => t.includes(normalizarTexto(termo)));
}

function mensagemEhSoCumprimento(texto = '') {
  const t = normalizarTexto(texto).replace(/[!?.;,]/g, '').trim();
  if (!t) return false;
  return TERMOS_CUMPRIMENTO.includes(t);
}

function contemCancelamentoOrcamento(texto = '') {
  const t = normalizarTexto(texto);
  return TERMOS_CANCELAMENTO_ORCAMENTO.some((termo) => t.includes(normalizarTexto(termo)));
}

function contemPedidoEnvioFoto(texto = '') {
  const t = normalizarTexto(texto);
  return [
    'posso mandar uma foto',
    'posso mandar foto',
    'posso enviar uma foto',
    'posso enviar foto',
    'enviar foto',
    'mandar foto',
  ].some((termo) => t.includes(termo));
}

function mensagemPedeStatusOuRetorno(texto = '') {
  const t = normalizarTexto(texto);
  const termos = [
    'status',
    'andamento',
    'retorno',
    'respondeu',
    'resposta',
    'quando',
    'prazo',
    'demora',
    'aprov',
    'confirm',
    'responsavel',
    'responsável',
    'novidade',
  ];
  return termos.some((termo) => t.includes(termo));
}

// ---------- Helpers ----------
function resumirMensagem(mensagem = '') {
  if (!mensagem) return '[vazia]';
  const texto = mensagem.replace(/\s+/g, ' ').trim();
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
}

async function setEstadoComLog(clienteId, estadoAtual, novoEstado, motivo) {
  if (estadoAtual === novoEstado) return;
  console.log('🔁 Transição de estado:', {
    clienteId,
    de: estadoAtual ?? 'SEM_ESTADO',
    para: novoEstado,
    motivo,
  });
  await setEstado(clienteId, novoEstado);
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
 * Compat: se preReservarSlot retornar boolean,
 * converte para { ok, reason }.
 */
function normalizarResultadoReserva(ret) {
  if (typeof ret === 'boolean') {
    return ret ? { ok: true } : { ok: false, reason: 'INDISPONIVEL' };
  }
  if (ret && typeof ret === 'object' && 'ok' in ret) {
    if (ret.ok) return ret;
    return { ...ret, reason: ret.reason || 'INDISPONIVEL' };
  }
  return { ok: false, reason: 'INDISPONIVEL' };
}

function shouldIgnoreWebhook(normalized) {
  const now = Date.now();

  // cleanup dedupe
  for (const [key, ts] of webhookDedupe.entries()) {
    if (now - ts > WEBHOOK_DEDUPE_TTL_MS) webhookDedupe.delete(key);
  }
  for (const [key, ts] of webhookHashDedupe.entries()) {
    if (now - ts > HASH_DEDUPE_TTL_MS) webhookHashDedupe.delete(key);
  }

  // só processa onmessage
  if (normalized.event && normalized.event !== 'onmessage') {
    return { ignore: true, reason: 'not_onmessage' };
  }

  // ignora mensagens nossas
  if (normalized.fromMe === true) {
    return { ignore: true, reason: 'fromMe' };
  }

  // dedupe por messageId
  if (normalized.messageId) {
    const last = webhookDedupe.get(normalized.messageId);
    if (last && now - last < WEBHOOK_DEDUPE_TTL_MS) {
      return { ignore: true, reason: 'duplicate' };
    }
    webhookDedupe.set(normalized.messageId, now);
    return { ignore: false };
  }

  // fallback dedupe por hash
  const text = normalized.text || '';
  const base64Length = normalized.base64 ? normalized.base64.length : 0;
  const hashKey = `${normalized.phone}|${normalized.kind}|${text}|${base64Length}`;
  const last = webhookHashDedupe.get(hashKey);
  if (last && now - last < HASH_DEDUPE_TTL_MS) {
    return { ignore: true, reason: 'duplicate' };
  }
  webhookHashDedupe.set(hashKey, now);
  return { ignore: false };
}

// ---------- CORS para PWA ----------
app.use((req, res, next) => {
  if (!OWNER_APP_ORIGIN) return next();

  const origin = req.headers.origin;
  if (origin && origin === OWNER_APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: '25mb' }));

// uploads
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// rotas
app.use('/upload', imageUploadRouter);
app.use('/owner/agenda', ownerAgendaRouter);
app.use('/owner', ownerRouter);

// PWA servido (se existir)
if (fs.existsSync(pwaDistPath)) {
  app.use('/pwa', express.static(pwaDistPath));
  app.get(['/pwa', '/pwa/*'], (req, res) => {
    res.sendFile(path.join(pwaDistPath, 'index.html'));
  });
}

app.get('/', (req, res) => {
  res.send('Servidor de atendimento IA rodando');
});

// ---------- WEBHOOK ----------
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

  // redundância segura
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

      const estadoAtual = atendimento?.estado ?? null;
      const modoManualAtivo = isManualAtivo(atendimento);

      console.log('🧭 Decisão webhook:', {
        clienteId: cliente.id,
        estadoAtual: estadoAtual ?? 'SEM_ESTADO',
        orcamentoIdAtual: atendimento?.orcamento_id_atual ?? null,
        kind: normalized.kind,
        mensagemResumo: resumirMensagem(mensagem),
      });

      // Dono assumiu: bot não responde
      if (modoManualAtivo) {
        await salvarMensagem(cliente.id, mensagem, 'entrada');
        return res.status(200).json({ ok: true, manual: true });
      }

      // Cancelamento SEMPRE tem prioridade
      if (contemCancelamentoOrcamento(mensagem)) {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (atendimento) {
          await setEstadoEOrcamento(cliente.id, ESTADO_EM_CONVERSA, null);
        }

        const respostaCancelamento = await gerarRespostaAssistente({
          estado: ESTADO_EM_CONVERSA,
          mensagemCliente: mensagem,
          objetivo: 'cliente cancelou ou não quer orçamento',
          contexto: {
            clienteTelefone: telefone,
            atendimentoEstado: estadoAtual || ESTADO_EM_CONVERSA,
            observacao:
              'O cliente deixou claro que NÃO quer orçamento. Responda confirmando que está tudo bem e pergunte como pode ajudar em outra coisa. Não peça foto.',
          },
          fallback: 'Tudo bem! Sem problema 😊. Se precisar de algo, me diga como posso ajudar.',
        });

        await salvarMensagem(cliente.id, respostaCancelamento, 'resposta');
        await enviarMensagem(telefone, respostaCancelamento);
        return res.sendStatus(200);
      }

      // Auto-cura: não pode ficar preso em AGUARDANDO_* se o orçamento atual não estiver válido
      if (atendimento && (estadoAtual === 'AGUARDANDO_APROVACAO_DONO' || estadoAtual === 'AGUARDANDO_DATA')) {
        const ok = await orcamentoPareceValido(atendimento.orcamento_id_atual);
        if (!ok) {
          await setEstadoComLog(cliente.id, estadoAtual, ESTADO_EM_CONVERSA, 'auto_cura_orcamento_invalido');
          const respostaAutoCura = await processarMensagem(telefone, mensagem);
          await enviarMensagem(telefone, respostaAutoCura);
          return res.sendStatus(200);
        }
      }

      // Se ainda não existe atendimento:
      if (!atendimento) {
        // Cumprimento simples: não pede foto
        if (mensagemEhSoCumprimento(mensagem) && !temIntencaoOrcamento(mensagem)) {
          await salvarMensagem(cliente.id, mensagem, 'entrada');
          const respostaCumprimento = await gerarRespostaAssistente({
            estado: ESTADO_EM_CONVERSA,
            mensagemCliente: mensagem,
            contexto: {
              clienteTelefone: telefone,
              observacao:
                'O cliente apenas cumprimentou. Responda com um cumprimento humano e pergunte como pode ajudar. Não peça foto e não assuma orçamento.',
            },
            fallback: 'Oi! Tudo bem? 😊 Como posso te ajudar?',
          });
          await salvarMensagem(cliente.id, respostaCumprimento, 'resposta');
          await enviarMensagem(telefone, respostaCumprimento);
          return res.sendStatus(200);
        }

        // Texto com intenção de orçamento: cria atendimento e vai para AGUARDANDO_FOTO (NUNCA aprovação!)
        if (temIntencaoOrcamento(mensagem)) {
          atendimento = await getOrCreateAtendimento(cliente.id);
          const estadoAntes = atendimento?.estado ?? ESTADO_EM_CONVERSA;
          await setEstadoComLog(cliente.id, estadoAntes, 'AGUARDANDO_FOTO', 'intencao_orcamento_texto_sem_imagem');

          await salvarMensagem(cliente.id, mensagem, 'entrada');
          const respostaFoto = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_FOTO',
            mensagemCliente: mensagem,
            objetivo: 'pedir foto do dano',
            contexto: {
              clienteTelefone: telefone,
              observacao:
                'Cliente pediu orçamento por texto. Peça 1 foto do dano e pergunte qual peça (porta/paralama/capô). 1 pergunta por vez.',
            },
            fallback: 'Claro! Pode me mandar uma foto do amassado e dizer qual parte do carro foi afetada? 🙂',
          });
          await salvarMensagem(cliente.id, respostaFoto, 'resposta');
          await enviarMensagem(telefone, respostaFoto);
          return res.sendStatus(200);
        }

        // Sem atendimento e sem intenção -> conversa normal via IA
        const respostaInicial = await processarMensagem(telefone, mensagem);
        await enviarMensagem(telefone, respostaInicial);
        return res.sendStatus(200);
      }

      // FINALIZADO: só volta a orçamento se o cliente pedir claramente
      if (estadoAtual === 'FINALIZADO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (temIntencaoOrcamento(mensagem)) {
          await setEstadoComLog(cliente.id, estadoAtual, 'AGUARDANDO_FOTO', 'novo_orcamento_apos_finalizado');
          const respostaFoto = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_FOTO',
            mensagemCliente: mensagem,
            objetivo: 'pedir foto do dano',
            contexto: {
              clienteTelefone: telefone,
              observacao: 'Novo orçamento após finalizado. Peça foto e peça afetada.',
            },
            fallback: 'Perfeito! Me manda uma foto do amassado e me diz qual parte do carro é 🙂',
          });
          await salvarMensagem(cliente.id, respostaFoto, 'resposta');
          await enviarMensagem(telefone, respostaFoto);
          return res.sendStatus(200);
        }

        const respostaFinalizado = await gerarRespostaAssistente({
          estado: 'FINALIZADO',
          mensagemCliente: mensagem,
          objetivo: 'atendimento finalizado',
          contexto: {
            clienteTelefone: telefone,
            observacao: 'Atendimento finalizado. Responda educadamente sem puxar orçamento.',
          },
          fallback: 'Entendi! 😊 Se você precisar de um orçamento novo, é só me avisar.',
        });

        await salvarMensagem(cliente.id, respostaFinalizado, 'resposta');
        await enviarMensagem(telefone, respostaFinalizado);
        return res.sendStatus(200);
      }

      // AGUARDANDO_FOTO: só pede foto/confirmar envio — não confirma responsável aqui
      if (estadoAtual === 'AGUARDANDO_FOTO') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        if (contemPedidoEnvioFoto(mensagem)) {
          const respostaConfirmacaoFoto = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_FOTO',
            mensagemCliente: mensagem,
            objetivo: 'confirmar envio de foto',
            contexto: {
              clienteTelefone: telefone,
              observacao: 'Cliente pergunta se pode enviar foto. Confirme e peça a foto do dano.',
            },
            fallback: 'Pode sim! 🙂 Me manda uma foto do dano (de perto e, se der, uma um pouco mais de longe).',
          });

          await salvarMensagem(cliente.id, respostaConfirmacaoFoto, 'resposta');
          await enviarMensagem(telefone, respostaConfirmacaoFoto);
          return res.sendStatus(200);
        }

        if (temIntencaoOrcamento(mensagem)) {
          const respostaReforcoFoto = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_FOTO',
            mensagemCliente: mensagem,
            objetivo: 'reforçar solicitação de foto',
            contexto: {
              clienteTelefone: telefone,
              observacao: 'Reforçar pedido de foto do dano e peça afetada, sem falar em responsável.',
            },
            fallback: 'Pra eu estimar certinho, me manda uma foto do amassado e me diz qual parte do carro foi afetada 🙂',
          });

          await salvarMensagem(cliente.id, respostaReforcoFoto, 'resposta');
          await enviarMensagem(telefone, respostaReforcoFoto);
          return res.sendStatus(200);
        }

        // se o cliente falar de outro assunto, responde normal
        const respostaLivre = await processarMensagem(telefone, mensagem);
        await enviarMensagem(telefone, respostaLivre);
        return res.sendStatus(200);
      }

      // ----------------------------
      // AGUARDANDO_DATA
      // ----------------------------
      if (estadoAtual === 'AGUARDANDO_DATA') {
        await salvarMensagem(cliente.id, mensagem, 'entrada');

        const { data, periodo } = extrairDataEPeriodo(mensagem);
        const periodoPreferido = normalizarPeriodo(periodo);

        if (!data) {
          const respostaData = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_DATA',
            mensagemCliente: mensagem,
            objetivo: 'pedir data',
            contexto: {
              clienteTelefone: telefone,
              observacao: 'Cliente precisa informar data (dd/mm) e opcional período (manhã/tarde).',
            },
            fallback: 'Me diz uma data no formato 28/12 🙂. Se quiser, pode falar manhã ou tarde.',
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
                  dataBr: formatarDataBr(sugestao.data),
                  periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
                },
                fallback: `Essa semana já fechou 😕. A próxima vaga é ${formatarDataBr(sugestao.data)} (${sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde'}). Pode ser?`,
              });
              await salvarMensagem(cliente.id, respostaSemanaCheia, 'resposta');
              await enviarMensagem(telefone, respostaSemanaCheia);
              return res.sendStatus(200);
            }

            const respostaSemanaCheia = await gerarRespostaAssistente({
              estado: 'AGUARDANDO_DATA',
              mensagemCliente: mensagem,
              objetivo: 'semana cheia',
              fallback: 'Essa semana já está completa 😕. Pode me sugerir outra data?',
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
                dataBr: formatarDataBr(sugestao.data),
                periodoTxt: sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde',
              },
              fallback: `Esse horário não dá 😕. A próxima vaga é ${formatarDataBr(sugestao.data)} (${sugestao.periodo === 'MANHA' ? 'manhã' : 'tarde'}). Pode ser?`,
            });

            await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
            await enviarMensagem(telefone, respostaIndisponivel);
            return res.sendStatus(200);
          }

          const respostaIndisponivel = await gerarRespostaAssistente({
            estado: 'AGUARDANDO_DATA',
            mensagemCliente: mensagem,
            objetivo: 'indisponivel',
            fallback: 'Esse horário não está disponível 😕. Pode tentar outra data ou dizer manhã/tarde?',
          });

          await salvarMensagem(cliente.id, respostaIndisponivel, 'resposta');
          await enviarMensagem(telefone, respostaIndisponivel);
          return res.sendStatus(200);
        }

        // pré-reservou
        await setPreferenciaData(atendimento.orcamento_id_atual, {
          data_preferida: data,
          periodo_preferido: periodoReservado,
        });

        await setEstadoComLog(cliente.id, estadoAtual, 'AGUARDANDO_APROVACAO_DONO', 'pre_reserva_realizada');

        const periodoTxt = periodoReservado === 'TARDE' ? 'tarde' : 'manhã';
        const respostaConfirmacao = await gerarRespostaAssistente({
          estado: 'AGUARDANDO_DATA',
          mensagemCliente: mensagem,
          objetivo: 'confirmar pre-reserva',
          dados: { dataBr: formatarDataBr(data), periodoTxt },
          fallback: `Perfeito — já pré-reservei ${formatarDataBr(data)} (${periodoTxt}) ✅. Agora estou confirmando com o responsável e já te retorno.`,
        });

        await salvarMensagem(cliente.id, respostaConfirmacao, 'resposta');
        await enviarMensagem(telefone, respostaConfirmacao);
        return res.sendStatus(200);
      }

      // ----------------------------
      // AGUARDANDO_APROVACAO_DONO
      // ----------------------------
      if (estadoAtual === 'AGUARDANDO_APROVACAO_DONO') {
        if (!atendimento.orcamento_id_atual) {
          await setEstadoComLog(cliente.id, estadoAtual, ESTADO_EM_CONVERSA, 'auto_cura_aprovacao_sem_orcamento');
          const respostaAutoCura = await processarMensagem(telefone, mensagem);
          await enviarMensagem(telefone, respostaAutoCura);
          return res.sendStatus(200);
        }

        await salvarMensagem(cliente.id, mensagem, 'entrada');

        const ehSobreStatus = mensagemPedeStatusOuRetorno(mensagem) || temIntencaoOrcamento(mensagem);

        if (!ehSobreStatus) {
          const respostaConversacional = await gerarRespostaAssistente({
            estado: ESTADO_EM_CONVERSA,
            mensagemCliente: mensagem,
            contexto: {
              clienteTelefone: telefone,
              observacao:
                'Existe orçamento pendente aguardando responsável. Se cliente falar de outro assunto, responda o assunto sem insistir em orçamento.',
            },
            fallback: 'Entendi 🙂. Me conta um pouco mais do que você precisa?',
          });

          await salvarMensagem(cliente.id, respostaConversacional, 'resposta');
          await enviarMensagem(telefone, respostaConversacional);
          return res.sendStatus(200);
        }

        const respostaStatus = await gerarRespostaAssistente({
          estado: 'AGUARDANDO_APROVACAO_DONO',
          mensagemCliente: mensagem,
          objetivo: 'aguardando confirmação do responsável',
          contexto: {
            clienteTelefone: telefone,
            observacao:
              'Orçamento aguardando confirmação do responsável. Responda curto e humano. Não invente valores.',
          },
          fallback: 'Deixa comigo 🙂. Ainda estou confirmando com o responsável e já te retorno.',
        });

        await salvarMensagem(cliente.id, respostaStatus, 'resposta');
        await enviarMensagem(telefone, respostaStatus);
        return res.sendStatus(200);
      }

      // Estado desconhecido -> conversa normal
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

      console.log('🧭 Decisão webhook:', {
        clienteId: cliente.id,
        estadoAtual: atendimento?.estado ?? 'SEM_ESTADO',
        orcamentoIdAtual: atendimento?.orcamento_id_atual ?? null,
        kind: normalized.kind,
        mensagemResumo: '[imagem]',
      });

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
        await setEstadoComLog(cliente.id, atendimento.estado, ESTADO_EM_CONVERSA, 'foto_recebida_apos_finalizado');
      }

      // Hardening: precisa base64 ou messageId
      if (!base64 && !messageId) {
        const respostaErro = await gerarRespostaAssistente({
          estado: ESTADO_EM_CONVERSA,
          mensagemCliente: '[erro ao receber foto]',
          objetivo: 'pedir foto',
          dados: { motivo: 'midia_ausente' },
          fallback: 'Não consegui receber sua foto 😕. Você pode reenviar, por favor?',
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
        fallback: 'Tive um probleminha ao analisar a foto 😕. Pode reenviar mais uma vez, por favor?',
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