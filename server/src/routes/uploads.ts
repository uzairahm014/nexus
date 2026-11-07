import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { requireAuth } from '../auth';

/**
 * Media ingestion for clips, avatars and banners.
 *
 * Free-tier friendly by design: uploads are capped at 12 MB, written to a local
 * directory (or UPLOAD_DIR on a mounted disk) and served statically. No paid
 * object storage or transcoding service is required.
 */

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; kind: 'video' | 'image' }> = {
  'video/mp4': { ext: '.mp4', kind: 'video' },
  'video/webm': { ext: '.webm', kind: 'video' },
  'video/quicktime': { ext: '.mov', kind: 'video' },
  'image/png': { ext: '.png', kind: 'image' },
  'image/jpeg': { ext: '.jpg', kind: 'image' },
  'image/webp': { ext: '.webp', kind: 'image' },
  'image/gif': { ext: '.gif', kind: 'image' },
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED[file.mimetype]?.ext ?? path.extname(file.originalname).slice(0, 6) ?? '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      cb(new Error('Unsupported file type. Upload MP4/WebM/MOV video or PNG/JPEG/WebP/GIF images.'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.get('/limits', (_req: Request, res: Response) => {
  res.json({
    maxBytes: MAX_BYTES,
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    note: 'Uploads are stored on the app disk. Attach a persistent disk for long-term storage.',
  });
});

router.post('/', requireAuth, (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      const message =
        err?.code === 'LIMIT_FILE_SIZE'
          ? 'That file is larger than the 12 MB upload limit.'
          : err?.message || 'Upload failed.';
      res.status(400).json({ error: message });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file received. Send it as multipart field "file".' });
      return;
    }
    const meta = ALLOWED[file.mimetype];
    res.status(201).json({
      url: `/uploads/${file.filename}`,
      kind: meta.kind,
      mimeType: file.mimetype,
      size: file.size,
    });
  });
});

export default router;
