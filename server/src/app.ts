import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { attachUser } from './auth';
import authRoutes from './routes/auth';
import socialRoutes from './routes/social';
import gameRoutes from './routes/games';
import contentRoutes from './routes/content';
import studioRoutes from './routes/studio';
import adminRoutes from './routes/admin';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite dev + CDN game engines; see docs/security.md
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origin = process.env.CLIENT_ORIGIN || '';
  app.use(
    cors({
      origin: origin ? origin.split(',').map((o) => o.trim()) : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'nexus-api', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', socialRoutes);
  app.use('/api', gameRoutes);
  app.use('/api', contentRoutes);
  app.use('/api/studio', studioRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Unknown API route.' });
  });

  // Serve the built SPA when present (single-service deployment).
  const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[nexus] unhandled', err?.message ?? err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
