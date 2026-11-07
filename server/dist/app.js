"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const auth_1 = require("./auth");
const auth_2 = __importDefault(require("./routes/auth"));
const social_1 = __importDefault(require("./routes/social"));
const games_1 = __importDefault(require("./routes/games"));
const content_1 = __importDefault(require("./routes/content"));
const studio_1 = __importDefault(require("./routes/studio"));
const admin_1 = __importDefault(require("./routes/admin"));
const uploads_1 = __importStar(require("./routes/uploads"));
function createApp() {
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false, // Vite dev + CDN game engines; see docs/security.md
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    const origin = process.env.CLIENT_ORIGIN || '';
    app.use((0, cors_1.default)({
        origin: origin ? origin.split(',').map((o) => o.trim()) : true,
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '512kb' }));
    app.use((0, cookie_parser_1.default)());
    app.use(auth_1.optionalAuth);
    const apiLimiter = (0, express_rate_limit_1.default)({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60_000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
    });
    app.use('/api', apiLimiter);
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, service: 'nexus-api', time: new Date().toISOString() });
    });
    app.use('/api/auth', auth_2.default);
    app.use('/api', social_1.default);
    app.use('/api', games_1.default);
    app.use('/api', content_1.default);
    app.use('/api/studio', studio_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api/uploads', uploads_1.default);
    // Uploaded media (clips, avatars, banners). Long cache: filenames are unique.
    app.use('/uploads', express_1.default.static(uploads_1.UPLOAD_DIR, {
        maxAge: '30d',
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'inline');
        },
    }));
    app.use('/api', (_req, res) => {
        res.status(404).json({ error: 'Unknown API route.' });
    });
    // Serve the built SPA when present (single-service deployment).
    const clientDist = process.env.CLIENT_DIST || node_path_1.default.join(__dirname, '..', '..', 'client', 'dist');
    if (node_fs_1.default.existsSync(clientDist)) {
        app.use(express_1.default.static(clientDist, { maxAge: '1h', index: false }));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api/'))
                return next();
            res.sendFile(node_path_1.default.join(clientDist, 'index.html'));
        });
    }
    app.use((err, _req, res, _next) => {
        console.error('[nexus] unhandled', err?.message ?? err);
        res.status(500).json({ error: 'Something went wrong on the server.' });
    });
    return app;
}
