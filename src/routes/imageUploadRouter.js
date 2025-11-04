import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { obterOuCriarCliente } from '../services/historicoService.js';
import { salvarImagem } from '../services/imagemService.js';
import {
  obterEmbeddingDoServico,
  obterEstimativaOrcamentoPorEmbedding
} from '../utils/embedClient.js';

const router = express.Router();

const uploadDir = path.join('src', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

router.post('/:telefone', upload.single('imagem'), async (req, res) => {
  const { telefone } = req.params;
  const { file } = req;

  console.log('[imageUploadRouter] Requisição recebida para upload.', {
    telefone,
    possuiArquivo: Boolean(file)
  });

  if (!telefone) {
    console.log('[imageUploadRouter] Telefone ausente na requisição.');
    return res.status(400).json({ error: 'Telefone é obrigatório' });
  }

  if (!file) {
    console.log('[imageUploadRouter] Nenhum arquivo de imagem encontrado no payload.');
    return res.status(400).json({ error: 'Imagem não enviada' });
  }

  try {
    console.log('[imageUploadRouter] Iniciando fluxo de persistência da imagem:', {
      telefone,
      nomeOriginal: file.originalname,
      caminhoTemporario: file.path
    });
    const cliente = await obterOuCriarCliente(telefone);
    console.log('[imageUploadRouter] Cliente identificado para upload:', cliente?.id);
    const embedding = await obterEmbeddingDoServico(file.path);
    console.log('[imageUploadRouter] Embedding calculado com sucesso para a imagem.');

    await salvarImagem({
      clienteId: cliente.id,
      caminho: file.path,
      nomeOriginal: file.originalname,
      embedding
    });
    console.log('[imageUploadRouter] Imagem persistida com sucesso no banco de dados.');

    const estimativa = await obterEstimativaOrcamentoPorEmbedding(embedding);
    console.log('[imageUploadRouter] Resposta da estimativa recebida:', estimativa);
    const { orcamento = null, detalhes = [] } = estimativa ?? {};

    res.json({
      message: 'Upload realizado com sucesso',
      file: {
        nomeOriginal: file.originalname,
        nomeSalvo: file.filename,
        caminho: file.path
      },
      orcamento,
      detalhes
    });
  } catch (err) {
    console.error('Erro upload imagem:', err);
    res.status(500).json({ error: 'Erro ao processar upload da imagem' });
  }
});

export default router;
