import fs from 'fs';
import path from 'path';
import multer from 'multer';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'attachments');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const safeName = (name: string) =>
  name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `${ts}-${rand}-${safeName(file.originalname)}`);
  },
});

export const attachmentUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});
