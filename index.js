// index.js - COMPLETELY FIXED VERSION
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Import routes FIRST
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';

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

// ✅ CRITICAL: Use routes BEFORE any other routes
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API test endpoint is working! 🎉'
  });
});

// ✅ FIXED: Catch-all handler with method logging
app.all('*', (req, res) => {
  console.log(`⚠️ Catch-all route hit: ${req.method} ${req.url}`);
  console.log(`📦 Headers:`, req.headers);
  
  if (req.method === 'POST') {
    console.log(`📦 POST Body:`, req.body);
  }
  
  res.status(404).json({ 
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    available_endpoints: [
      'GET /api/health',
      'GET /api/test', 
      'GET /api/medical/test',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/medical/update',
      'GET /api/medical/:user_id'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Routes loaded: auth, medical`);
});
