// index.js - FIXED VERSION WITH ADMIN ROUTES
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// ✅ IMPORT ALL ROUTES
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';
import adminRoutes from './routes/admin.js'; // ✅ ADD ADMIN ROUTES

const app = express();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'https://healthscanqr2025.vercel.app',
    'https://health-scan-qr2025.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ USE ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes); // ✅ ADD ADMIN ROUTES

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test routes
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API test endpoint is working! 🎉'
  });
});

app.get('/api/medical/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Medical endpoint is working! 🎉'
  });
});

// ✅ TEST ADMIN ENDPOINT
app.get('/api/admin/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Admin endpoint is working! 🎉'
  });
});

// Catch-all handler
app.all('*', (req, res) => {
  console.log(`⚠️ Catch-all route hit: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    available_endpoints: [
      'GET /api/health',
      'GET /api/test', 
      'GET /api/medical/test',
      'GET /api/admin/test', // ✅ ADD ADMIN TEST
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/admin/admin-login', // ✅ ADD ADMIN LOGIN
      'POST /api/medical/update',
      'GET /api/medical/:user_id'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`✅ Admin test: https://healthscanqr-backend.onrender.com/api/admin/test`); // ✅ ADD ADMIN TEST
});
