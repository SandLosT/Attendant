import express from 'express';
import multer from 'multer';
import path from 'path';
import { salvarImagem } from './servicos/imagemService.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: 'src/public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname);
  }
});

const upload = multer({ storage });

router.post('/upload-imagem', upload.single('imagem'), async (req, res) => {
  const { telefone } = req.body;
  const file = req.file;

  try {
    const resultado = await salvarImagem(telefone, file);
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao salvar imagem:', err);
    res.status(500).json({ erro: 'Falha ao processar imagem' });
  }
});

export default router;
