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
// 🎯 WORKING NEON AUTH IMPLEMENTATION
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

// Working Neon Auth Register
app.post('/api/neon-auth/register', async (req, res) => {
  try {
    console.log('🔐 REGISTER - Body received:', req.body);
    
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }
    
    console.log('📤 Calling Neon Auth API...');
    
    const authResponse = await fetch('https://api.stack-auth.com/api/v1/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`,
        'X-Project-Id': process.env.STACK_PROJECT_ID
      },
      body: JSON.stringify({
        project_id: process.env.STACK_PROJECT_ID,
        email: email,
        password: password,
        display_name: name,
        email_verified: false
      })
    });

    console.log('📥 Response status:', authResponse.status);
    
    const responseText = await authResponse.text();
    console.log('📥 Raw response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from Neon Auth',
        rawResponse: responseText.substring(0, 500)
      });
    }

    if (!authResponse.ok) {
      console.error('❌ Neon Auth API error:', result);
      return res.status(400).json({
        success: false,
        error: result.message || 'Registration failed',
        details: result
      });
    }

    console.log('✅ User created:', result.user?.id);
    
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
    
    const authResponse = await fetch('https://api.stack-auth.com/api/v1/auth/email-password/sign-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`,
        'X-Project-Id': process.env.STACK_PROJECT_ID
      },
      body: JSON.stringify({
        project_id: process.env.STACK_PROJECT_ID,
        email: email,
        password: password
      })
    });

    console.log('📥 Login response status:', authResponse.status);
    
    const responseText = await authResponse.text();
    console.log('📥 Login raw response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from Neon Auth'
      });
    }

    if (!authResponse.ok) {
      console.error('❌ Login error:', result);
      return res.status(401).json({
        success: false,
        error: result.message || 'Invalid credentials'
      });
    }

    console.log('✅ Login successful:', result.user?.id);
    
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

// Get user profile with JWKS verification
app.get('/api/neon-auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    console.log('🔐 Verifying token...');
    
    // Verify token using Neon Auth API
    const authResponse = await fetch('https://api.stack-auth.com/api/v1/auth/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`,
        'X-Project-Id': process.env.STACK_PROJECT_ID
      },
      body: JSON.stringify({
        access_token: token
      })
    });

    console.log('📥 Token verification status:', authResponse.status);
    
    const responseText = await authResponse.text();
    console.log('📥 Token verification response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from token verification'
      });
    }

    if (!authResponse.ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
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
  const hasProjectId = !!process.env.STACK_PROJECT_ID;
  const hasSecretKey = !!process.env.STACK_SECRET_SERVER_KEY;
  
  res.json({
    success: true,
    message: 'Neon Auth Status',
    environment: {
      projectId: hasProjectId ? '✅ Set' : '❌ Missing',
      secretKey: hasSecretKey ? '✅ Set' : '❌ Missing',
      projectIdValue: hasProjectId ? process.env.STACK_PROJECT_ID.substring(0, 8) + '...' : 'None'
    },
    jwksUrl: 'https://api.stack-auth.com/api/v1/projects/565aeec4-a59c-4383-a9a1-0ae58a08959b/.well-known/jwks.json',
    endpoints: {
      test: 'POST /api/simple-test',
      register: 'POST /api/neon-auth/register',
      login: 'POST /api/neon-auth/login',
      profile: 'GET /api/neon-auth/me'
    },
    timestamp: new Date().toISOString()
  });
});

// =============================================
// ✅ EXISTING ROUTES
// =============================================

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
      'POST /api/simple-test',
      'POST /api/neon-auth/register',
      'POST /api/neon-auth/login',
      'GET /api/neon-auth/me'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Neon Auth Project ID: ${process.env.STACK_PROJECT_ID ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`🔐 Neon Auth Secret Key: ${process.env.STACK_SECRET_SERVER_KEY ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`🔗 JWKS URL: https://api.stack-auth.com/api/v1/projects/565aeec4-a59c-4383-a9a1-0ae58a08959b/.well-known/jwks.json`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`🎉 Neon Auth is READY!`);
});
