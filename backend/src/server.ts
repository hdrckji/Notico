import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

console.log('Booting backend...', {
  nodeEnv: process.env.NODE_ENV || 'undefined',
  host: HOST,
  port: PORT,
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({ service: 'supplier-appointments-backend', status: 'OK' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);

  setImmediate(async () => {
    try {
      const [authModule, supplierModule, appointmentModule, locationModule, adminModule] = await Promise.all([
        import('./routes/auth'),
        import('./routes/suppliers'),
        import('./routes/appointments'),
        import('./routes/locations'),
        import('./routes/admin'),
      ]);

      app.use('/api/auth', authModule.default);
      app.use('/api/suppliers', supplierModule.default);
      app.use('/api/appointments', appointmentModule.default);
      app.use('/api/locations', locationModule.default);
      app.use('/api/admin', adminModule.default);

      console.log('✅ API routes initialized');
    } catch (error) {
      console.error('⚠️ API routes initialization failed:', error);
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
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
