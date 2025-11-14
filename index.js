// index.js - UPDATED WITH PROPER FILE UPLOAD CONFIG
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add this for form data

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  credentials: true
}));

// ✅ Serve uploaded images - MUST BE BEFORE ROUTES
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ ADD THIS: Test Neon Database Route
app.get('/api/test-neon', async (req, res) => {
  try {
    // Test 1: Simple query to check connection
    const result = await pool.query('SELECT version() as postgres_version, current_timestamp as server_time');
    
    // Test 2: Get users from your table
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🚀 API listening on http://localhost:${PORT}`);
  console.log(`📊 Test Neon database at: http://localhost:${PORT}/api/test-neon`);
});