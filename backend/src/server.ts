import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { startAutoCancelUndeliveredJob } from './services/appointmentAutoCancel';
import { normalizeCancelledStatusesToNoShow } from './services/normalizeAppointmentStatuses';
import { ensurePerformanceIndexes } from './services/ensureIndexes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';
let stopAutoCancelJob: (() => void) | null = null;

console.log('Booting backend...', {
  nodeEnv: process.env.NODE_ENV || 'undefined',
  host: HOST,
  port: PORT,
});

// Middleware
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests and local tools without Origin header.
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = allowedOrigins.includes(origin);
    const isVercelPreview = /https:\/\/.*\.vercel\.app$/i.test(origin);

    if (isExplicitlyAllowed || isVercelPreview) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({ service: 'supplier-appointments-backend', status: 'OK' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  stopAutoCancelJob = startAutoCancelUndeliveredJob();

  setImmediate(async () => {
    try {
      await ensurePerformanceIndexes();
    } catch (error) {
      console.error('[indexes] Echec initialisation des index de performance:', error);
    }

    try {
      const normalized = await normalizeCancelledStatusesToNoShow();
      if (normalized.appointments || normalized.historyToStatus || normalized.historyFromStatus) {
        console.log(
          `[status-normalize] ${normalized.appointments} appointments, ${normalized.historyToStatus} history toStatus, ${normalized.historyFromStatus} history fromStatus converts vers NO_SHOW.`
        );
      }
    } catch (error) {
      console.error('[status-normalize] Echec de la normalisation des statuts CANCELLED vers NO_SHOW:', error);
    }

    const routeLoaders = [
      { prefix: '/api/auth', modulePath: './routes/auth' },
      { prefix: '/api/suppliers', modulePath: './routes/suppliers' },
      { prefix: '/api/appointments', modulePath: './routes/appointments' },
      { prefix: '/api/locations', modulePath: './routes/locations' },
      { prefix: '/api/admin', modulePath: './routes/admin' },
    ];

    for (const route of routeLoaders) {
      try {
        const mod = await import(route.modulePath);
        app.use(route.prefix, mod.default);
        console.log(`✅ Route initialized: ${route.prefix}`);
      } catch (error) {
        console.error(`⚠️ Route initialization failed for ${route.prefix}:`, error);
      }
    }
  });
});

server.on('error', (error) => {
  console.error('HTTP server error:', error);
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express error middleware:', err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  if (stopAutoCancelJob) {
    stopAutoCancelJob();
  }
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
