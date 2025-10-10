import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { salvarImagem } from "../imagemService.js";
import { obterEmbeddingDoServico } from "../node_utils/embedClient.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { file } = req;
    const idUsuario = req.body.usuarioId || null;

    // Move arquivo para pasta final
    const destino = path.join("src/public/uploads", file.originalname);
    fs.renameSync(file.path, destino);

    // Gera embedding chamando microserviço Python
    const embedding = await obterEmbeddingDoServico(destino);

    // Salva no DB
    await salvarImagem(file.originalname, destino, idUsuario, embedding);

    res.json({ message: "Upload realizado com sucesso", file: file.originalname });
  } catch (err) {
    console.error("Erro upload:", err.message);
    res.status(500).json({ error: "Erro ao fazer upload" });
  }
});

export default router;
