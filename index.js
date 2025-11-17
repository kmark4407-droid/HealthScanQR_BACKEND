// index.js - COMPLETE REVISED VERSION WITH WORKING NEON AUTH
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
// 🎯 CLEAN NEON AUTH IMPLEMENTATION
// =============================================

// Test if body parsing works
app.post('/api/test-body', (req, res) => {
  console.log('✅ TEST Body received:', req.body);
  res.json({
    success: true,
    message: 'Body parsing is working!',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Working Neon Auth Register
app.post('/api/neon-auth/register', async (req, res) => {
  try {
    console.log('🔐 REGISTER - Body received:', req.body);
    
    const { email, password, name } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
        received: req.body
      });
    }
    
    console.log('📤 Calling Neon Auth API...');
    
    // Call Neon Auth
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/565aeec4-a59c-4383-a9a1-0ae58a08959b/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
      },
      body: JSON.stringify({
        email: email,
        password: password,
        display_name: name,
        email_verified: false
      })
    });

    const result = await authResponse.json();
    console.log('📥 Neon Auth response:', result);

    if (!authResponse.ok) {
      return res.status(400).json({
        success: false,
        error: result.message || 'Registration failed',
        details: result
      });
    }

    // Success!
    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.display_name
      }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during registration'
    });
  }
});

// Working Neon Auth Login
app.post('/api/neon-auth/login', async (req, res) => {
  try {
    console.log('🔐 LOGIN - Body received:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    console.log('📤 Calling Neon Auth login...');
    
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/565aeec4-a59c-4383-a9a1-0ae58a08959b/auth/email-password/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
      },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    const result = await authResponse.json();
    console.log('📥 Neon Auth login response:', result);

    if (!authResponse.ok) {
      return res.status(401).json({
        success: false,
        error: result.message || 'Invalid credentials'
      });
    }

    // Login successful
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.display_name
      },
      access_token: result.tokens.access_token,
      refresh_token: result.tokens.refresh_token
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
});

// Get user profile
app.get('/api/neon-auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/565aeec4-a59c-4383-a9a1-0ae58a08959b/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
      },
      body: JSON.stringify({
        access_token: token
      })
    });

    const result = await authResponse.json();

    if (!authResponse.ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    res.json({
      success: true,
      user: {
        id: result.user_id,
        email: result.primary_email,
        name: result.display_name
      }
    });
    
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Token verification failed'
    });
  }
});

// Neon Auth status check
app.get('/api/neon-auth/status', (req, res) => {
  res.json({
    success: true,
    message: 'Neon Auth is ready!',
    projectId: '565aeec4-a59c-4383-a9a1-0ae58a08959b',
    endpoints: {
      testBody: 'POST /api/test-body',
      register: 'POST /api/neon-auth/register',
      login: 'POST /api/neon-auth/login',
      profile: 'GET /api/neon-auth/me'
    },
    timestamp: new Date().toISOString()
  });
});

// =============================================
// ✅ EXISTING ROUTES (KEEP THESE)
// =============================================

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    neon_auth: process.env.STACK_PROJECT_ID ? '✅ Configured' : '❌ Not configured'
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

// TEST ADMIN ENDPOINT
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
      'GET /api/neon-auth/status',
      'POST /api/test-body',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/neon-auth/register',
      'POST /api/neon-auth/login',
      'GET /api/neon-auth/me',
      'POST /api/admin/admin-login',
      'POST /api/medical/update',
      'GET /api/medical/:user_id'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Neon Auth Project ID: ${process.env.STACK_PROJECT_ID ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`🔐 Neon Auth Secret Key: ${process.env.STACK_SECRET_SERVER_KEY ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`✅ Neon Auth status: https://healthscanqr-backend.onrender.com/api/neon-auth/status`);
  console.log(`🎉 Neon Auth is READY for testing!`);
});
