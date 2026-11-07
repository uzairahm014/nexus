"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_DIR = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const auth_1 = require("../auth");
/**
 * Media ingestion for clips, avatars and banners.
 *
 * Free-tier friendly by design: uploads are capped at 12 MB, written to a local
 * directory (or UPLOAD_DIR on a mounted disk) and served statically. No paid
 * object storage or transcoding service is required.
 */
exports.UPLOAD_DIR = process.env.UPLOAD_DIR
    ? node_path_1.default.resolve(process.env.UPLOAD_DIR)
    : node_path_1.default.join(process.cwd(), 'uploads');
node_fs_1.default.mkdirSync(exports.UPLOAD_DIR, { recursive: true });
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = {
    'video/mp4': { ext: '.mp4', kind: 'video' },
    'video/webm': { ext: '.webm', kind: 'video' },
    'video/quicktime': { ext: '.mov', kind: 'video' },
    'image/png': { ext: '.png', kind: 'image' },
    'image/jpeg': { ext: '.jpg', kind: 'image' },
    'image/webp': { ext: '.webp', kind: 'image' },
    'image/gif': { ext: '.gif', kind: 'image' },
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, exports.UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = ALLOWED[file.mimetype]?.ext ?? node_path_1.default.extname(file.originalname).slice(0, 6) ?? '';
        cb(null, `${Date.now()}-${node_crypto_1.default.randomBytes(6).toString('hex')}${ext}`);
    },
});
const upload = (0, multer_1.default)({
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
const router = (0, express_1.Router)();
router.get('/limits', (_req, res) => {
    res.json({
        maxBytes: MAX_BYTES,
        video: ['video/mp4', 'video/webm', 'video/quicktime'],
        image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        note: 'Uploads are stored on the app disk. Attach a persistent disk for long-term storage.',
    });
});
router.post('/', auth_1.requireAuth, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const message = err?.code === 'LIMIT_FILE_SIZE'
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
exports.default = router;
