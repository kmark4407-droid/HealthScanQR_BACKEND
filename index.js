// index.js - WITH ALL ROUTES ENABLED
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const app = express();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS Configuration - EXPANDED
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'https://healthscanqr2025.vercel.app',
    'https://health-scan-qr2025.vercel.app',
    'https://healthscanqr2025.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.options('*', cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// ✅ IMPORTANT: Add ALL Routes
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js'; // ← UNCOMMENT THIS
// import adminRoutes from './routes/admin.js';   // Keep admin commented for now

// ✅ USE ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes); // ← UNCOMMENT THIS
// app.use('/api/admin', adminRoutes);   // Keep admin commented for now

// Simple catch-all handler
app.get('*', (req, res) => {
  res.json({ 
    message: 'HealthScan QR API Server',
    available_endpoints: [
      '/api/health',
      '/api/test',
      '/api/auth/register',
      '/api/auth/login',
      '/api/medical/update', // ← NOW AVAILABLE!
      '/api/medical/:user_id'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`✅ Medical endpoint: https://healthscanqr-backend.onrender.com/api/medical/update`);
});
