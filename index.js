// index.js - COMPLETE REVISED VERSION
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Import routes
import authRoutes from './routes/auth.js';
import medicalRoutes from './routes/medical.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================
// 🎯 CORS CONFIGURATION FOR MOBILE & VERCEL
// =============================================

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:4200',
      'https://healthscanqr2025.vercel.app',
      'https://health-scan-qr2025.vercel.app',
      'https://healthscanqr.vercel.app',
      'https://healthscanqr2025-git-main-healthscanqrs-projects.vercel.app',
      // For local mobile testing
      'http://localhost',
      'http://localhost:8100',
      'capacitor://localhost',
      'ionic://localhost'
    ];
    
    // Allow all vercel.app subdomains
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`🔒 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']?.substring(0, 50) + '...');
  next();
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// 🎯 ROOT AND CORE ENDPOINTS
// =============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running! 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    cors: '✅ ENABLED for mobile',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      medical: '/api/medical/*', 
      admin: '/api/admin/*'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: '✅ ENABLED'
  });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test successful!',
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
});

// =============================================
// 🎯 USE ROUTES - IMPORTANT: Must be here
// =============================================

// Use routes - ALL authentication routes come from auth.js
app.use('/api/auth', authRoutes);      // <-- This includes /register, /login, /firebase-verify-callback
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 LEGACY FIREBASE REDIRECT (for compatibility)
// =============================================

// This maintains compatibility with Firebase Action URL settings
app.get('/api/auth/firebase-verify-callback', (req, res) => {
  console.log('🔄 Legacy callback hit, preserving for Firebase compatibility');
  // Just pass through to the auth routes
  // The actual handler is in auth.js
  res.redirect(`/api/auth/firebase-verify-callback?${new URLSearchParams(req.query).toString()}`);
});

// =============================================
// 🎯 EMAIL VERIFICATION ENDPOINTS (for direct access)
// =============================================

// Manual verification endpoint (admin/quick verify)
app.post('/api/verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('⚡ Quick email verification for:', email);

    // Import the database pool
    const pool = (await import('./db.js')).default;
    
    const result = await pool.query(
      'UPDATE users SET email_verified = true WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: '✅ Email verified successfully!',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Quick verify error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification' 
    });
  }
});

// =============================================
// 🎯 DEBUG ENDPOINTS
// =============================================

app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  // Get all registered routes
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });

  res.json({
    success: true,
    totalRoutes: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path))
  });
});

// =============================================
// 🎯 CATCH-ALL HANDLER
// =============================================

app.all('*', (req, res) => {
  console.log(`⚠️ 404 - Route not found: ${req.method} ${req.url}`);
  console.log(`⚠️ Origin: ${req.headers.origin}`);
  
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/cors-test',
      'GET /api/debug/routes',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'GET /api/auth/firebase-verify-callback',
      'POST /api/auth/resend-verification',
      'POST /api/medical/update',
      'GET /api/medical/:user_id',
      'POST /api/medical/test-post',
      'POST /api/admin/admin-login',
      'POST /api/verify-email (Admin)'
    ]
  });
});

// =============================================
// 🎯 START SERVER
// =============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS ENABLED for:`);
  console.log(`   - https://healthscanqr2025.vercel.app`);
  console.log(`   - https://*.vercel.app (all subdomains)`);
  console.log(`   - Local development`);
  console.log(`✅ AUTHENTICATION ENDPOINTS READY:`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET /api/auth/me`);
  console.log(`   GET /api/auth/firebase-verify-callback`);
  console.log(`✅ MEDICAL ENDPOINTS READY:`);
  console.log(`   POST /api/medical/update`);
  console.log(`   GET /api/medical/:user_id`);
  console.log(`✅ Test URLs:`);
  console.log(`   https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`   https://healthscanqr-backend.onrender.com/api/cors-test`);
  console.log(`   https://healthscanqr-backend.onrender.com/api/auth/test`);
});
