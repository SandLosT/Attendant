import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { obterOuCriarCliente } from './service/historicoService.js';
import { salvarImagem } from './imagemService.js';

const router = express.Router();

const uploadDir = 'src/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const nome = file.originalname.replace(ext, '');
    cb(null, `${nome}-${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

router.post('/:telefone', upload.single('imagem'), async (req, res) => {
  const telefone = req.params.telefone;
  const file = req.file;

  if (!file) return res.status(400).json({ erro: 'Imagem não enviada' });

  try {
    const cliente = await obterOuCriarCliente(telefone);
    const caminho = file.path;
    const nomeOriginal = file.originalname;
    const hash = gerarHashSimples(caminho); // pode trocar por real hash de imagem

    await salvarImagem(cliente.id, caminho, nomeOriginal, hash);
    res.status(200).json({ sucesso: true, mensagem: 'Imagem salva com sucesso' });
  } catch (err) {
    console.error('Erro ao salvar imagem:', err);
    res.status(500).json({ erro: 'Erro interno ao salvar imagem' });
  }
});

function gerarHashSimples(string) {
  return string.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(16);
}

export default router;
