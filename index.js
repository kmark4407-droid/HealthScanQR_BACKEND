// index.js - FIXED VERSION
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';
import adminRoutes from './routes/admin.js'; // NOW FIXED
import pool from './db.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS Configuration
const allowedOrigins = [
  'http://localhost:4200',
  'https://healthscanqr2025.vercel.app',
  'https://health-scan-qr2025.vercel.app',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy violation';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.options('*', cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test Neon Database
app.get('/api/test-neon', async (req, res) => {
  try {
    const result = await pool.query('SELECT version() as version, NOW() as time');
    res.json({
      success: true,
      database: result.rows[0],
      message: 'Database connected!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Routes (NOW WITH FIXED ADMIN ROUTES)
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes); // NOW SAFE TO USE

// Catch all handler
app.get('*', (req, res) => {
  res.json({ message: 'HealthScan QR API Server' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API listening on port ${PORT}`);
});
