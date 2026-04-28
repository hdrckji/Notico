import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, async () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);

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
