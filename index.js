// index.js - FIXED ROUTE PATHS
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';
import adminRoutes from './routes/admin.js';
import pool from './db.js';

const app = express();

// ✅ Needed for serving static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIXED CORS Configuration for Production
const allowedOrigins = [
  'http://localhost:4200',
  'https://healthscanqr2025.vercel.app',
  'https://health-scan-qr2025.vercel.app',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ FIXED: Simple health check route (no complex path parameters)
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'HealthScan QR API Server is running!'
  });
});

// ✅ FIXED: Test Neon Database Route (simple path)
app.get('/api/test-neon', async (req, res) => {
  try {
    const result = await pool.query('SELECT version() as postgres_version, current_timestamp as server_time');
    const usersResult = await pool.query('SELECT id, full_name, email, username, created_at FROM users ORDER BY id LIMIT 10');
    
    res.json({
      success: true,
      database: {
        version: result.rows[0].postgres_version,
        serverTime: result.rows[0].server_time,
        connection: '✅ Successful'
      },
      users: {
        count: usersResult.rowCount,
        data: usersResult.rows
      },
      message: 'Neon database is working perfectly! 🎉'
    });
  } catch (error) {
    console.error('❌ Neon test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to connect to Neon database'
    });
  }
});

// Test DB connection
pool.connect()
  .then(client => {
    console.log('✅ Connected to PostgreSQL successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

// ✅ FIXED: Import and use routes (make sure your route files don't have malformed paths)
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// ✅ FIXED: Simple catch-all handler
app.get('*', (req, res) => {
  res.json({ 
    message: 'HealthScan QR API Server',
    endpoints: {
      health: '/api/health',
      testNeon: '/api/test-neon',
      auth: '/api/auth',
      medical: '/api/medical',
      admin: '/api/admin'
    }
  });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API listening on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
});
