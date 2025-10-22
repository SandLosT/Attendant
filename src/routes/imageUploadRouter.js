import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { salvarImagem } from '../services/imagemService.js';
import { obterEmbeddingDoServico } from '../utils/embedClient.js';

const router = express.Router();

const upload = multer({ dest: path.join('src', 'uploads', 'tmp') });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    const clienteId = req.body.clienteId ? Number(req.body.clienteId) : null;
    if (!clienteId) {
      return res.status(400).json({ error: 'clienteId é obrigatório' });
    }

    const destinoFinal = path.join('src', 'public', 'uploads');
    if (!fs.existsSync(destinoFinal)) {
      fs.mkdirSync(destinoFinal, { recursive: true });
    }

    const destino = path.join(destinoFinal, file.originalname);
    fs.renameSync(file.path, destino);

    const embedding = await obterEmbeddingDoServico(destino);

    await salvarImagem({
      clienteId,
      caminho: destino,
      nomeOriginal: file.originalname,
      embedding
    });

    res.json({ message: 'Upload realizado com sucesso', file: file.originalname });
  } catch (err) {
    console.error('Erro upload:', err.message);
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

export default router;
