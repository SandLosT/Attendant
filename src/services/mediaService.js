import fs from 'fs';
import path from 'path';

const uploadsRelativeDir = 'uploads';
const uploadDir = path.resolve(process.cwd(), 'src/public', uploadsRelativeDir);

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

function stripDataPrefix(base64) {
  if (typeof base64 !== 'string') return base64;
  const match = base64.match(/^data:[^;]+;base64,(.*)$/);
  return match ? match[1] : base64;
}

function inferExtension(mimetype) {
  switch (mimetype) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export function saveBase64ToUploads({ base64, mimetype, filename }) {
  if (!base64) {
    throw new Error('Conteúdo base64 é obrigatório para salvar o arquivo.');
  }

  ensureUploadDir();

  const cleanBase64 = stripDataPrefix(base64);
  const extension = inferExtension(mimetype);
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const finalName = filename || uniqueName;
  const filePath = path.join(uploadDir, uniqueName);
  const relativePath = path.join(uploadsRelativeDir, uniqueName);

  fs.writeFileSync(filePath, cleanBase64, { encoding: 'base64' });

  return {
    filePath: path.resolve(filePath),
    relativePath,
    originalName: finalName,
  };
}
