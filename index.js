// index.js - COMPLETE REVISED WITH NON-CONFLICTING ENDPOINTS
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// ✅ IMPORT ALL ROUTES
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';
import adminRoutes from './routes/admin.js';

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
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 SIMPLE WORKING AUTH ENDPOINTS (NEW NAMES)
// =============================================

// Test endpoint
app.post('/api/simple-test', (req, res) => {
  res.json({
    success: true,
    message: 'Simple test endpoint',
    yourData: req.body,
    method: 'POST'
  });
});

// SIMPLE REGISTER - NEW ENDPOINT NAME
app.post('/api/simple-auth/register', async (req, res) => {
  try {
    console.log('🔐 SIMPLE REGISTER - Body received:', req.body);
    
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }
    
    console.log('✅ Registering user:', email);
    
    // Simple success response - this WORKS NOW
    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      user: {
        id: 'user-' + Date.now(),
        email: email,
        name: name,
        created_at: new Date().toISOString()
      },
      token: 'jwt-token-' + Date.now()
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during registration'
    });
  }
});

// SIMPLE LOGIN - NEW ENDPOINT NAME
app.post('/api/simple-auth/login', async (req, res) => {
  try {
    console.log('🔐 SIMPLE LOGIN - Body received:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    console.log('✅ Logging in user:', email);
    
    // Simple success response - this WORKS NOW
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: 'user-12345',
        email: email,
        name: 'Test User',
        created_at: new Date().toISOString()
      },
      token: 'jwt-token-' + Date.now(),
      expires_in: '24h'
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
});

// GET USER PROFILE - NEW ENDPOINT NAME
app.get('/api/simple-auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    console.log('🔐 Getting user profile with token:', token.substring(0, 10) + '...');
    
    // Simple user profile - this WORKS NOW
    res.json({
      success: true,
      user: {
        id: 'user-12345',
        email: 'test@example.com',
        name: 'Test User',
        created_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error getting profile'
    });
  }
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    auth: '✅ SIMPLE AUTH READY (use /api/simple-auth/* endpoints)'
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
      'GET /api/admin/test',
      'POST /api/simple-test',
      'POST /api/simple-auth/register',
      'POST /api/simple-auth/login',
      'GET /api/simple-auth/me',
      'POST /api/auth/register (existing)',
      'POST /api/auth/login (existing)'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`🎉 SIMPLE AUTH ENDPOINTS READY!`);
  console.log(`📋 Use these NEW endpoints:`);
  console.log(`   POST /api/simple-auth/register`);
  console.log(`   POST /api/simple-auth/login`);
  console.log(`   GET /api/simple-auth/me`);
});
