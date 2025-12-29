import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { handleImagemOrcamentoFlow } from '../usecases/handleImagemOrcamentoFlow.js';

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
    console.log('[imageUploadRouter] Iniciando fluxo de processamento da imagem:', {
      telefone,
      nomeOriginal: file.originalname,
      caminhoTemporario: file.path
    });
    const base64 = fs.readFileSync(file.path).toString('base64');
    const resultado = await handleImagemOrcamentoFlow({
      telefone,
      base64,
      mimetype: file.mimetype,
      filename: file.originalname,
    });

    res.json({
      resposta: resultado.resposta,
      estimate: resultado.estimate,
      orcamentoId: resultado.orcamentoId,
      atendimentoEstado: resultado.atendimentoEstado,
    });
  } catch (err) {
    console.error('Erro upload imagem:', err);
    res.status(500).json({ error: 'Erro ao processar upload da imagem' });
  }
});

export default router;
