// index.js - REVISED WITH DEBUG LOGGING FOR NEON AUTH
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
// 🎯 DEBUG NEON AUTH IMPLEMENTATION
// =============================================

// Test endpoint with manual body parsing
app.post('/api/simple-test', (req, res) => {
  console.log('✅ TEST - Express parsed body:', req.body);
  
  // Manual body parsing as backup
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  
  req.on('end', () => {
    console.log('✅ TEST - Raw body data:', rawBody);
    
    let manuallyParsed = {};
    if (rawBody) {
      try {
        manuallyParsed = JSON.parse(rawBody);
      } catch (e) {
        console.error('✅ TEST - Manual parse error:', e);
      }
    }
    
    res.json({
      success: true,
      message: 'Simple test endpoint',
      yourData: req.body,
      method: 'POST',
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    });
  });
});

// Debug Neon Auth Register
app.post('/api/neon-auth/register', async (req, res) => {
  try {
    console.log('🔐 REGISTER - Body received:', req.body);
    
    const { email, password, name } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }
    
    console.log('📤 Calling Neon Auth API...');
    console.log('🔑 Project ID:', process.env.STACK_PROJECT_ID);
    console.log('🔐 Secret Key exists:', !!process.env.STACK_SECRET_SERVER_KEY);
    console.log('📧 Creating user:', email);
    
    // Call Neon Auth with better error handling
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/${process.env.STACK_PROJECT_ID}/users`, {
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

    console.log('📥 Neon Auth response status:', authResponse.status);
    console.log('📥 Neon Auth response headers:', authResponse.headers);
    
    const responseText = await authResponse.text();
    console.log('📥 Neon Auth raw response:', responseText);
    
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
        details: result,
        status: authResponse.status
      });
    }

    console.log('✅ User created in Neon Auth:', result.user?.id);
    
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
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Server error during registration',
      details: error.message
    });
  }
});

// Debug Neon Auth Login
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
    console.log('🔑 Project ID:', process.env.STACK_PROJECT_ID);
    
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/${process.env.STACK_PROJECT_ID}/auth/email-password/sign-in`, {
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

    console.log('📥 Neon Auth login response status:', authResponse.status);
    
    const responseText = await authResponse.text();
    console.log('📥 Neon Auth login raw response:', responseText);
    
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
      console.error('❌ Neon Auth login error:', result);
      return res.status(401).json({
        success: false,
        error: result.message || 'Invalid credentials',
        details: result
      });
    }

    console.log('✅ Login successful for user:', result.user?.id);

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
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Server error during login',
      details: error.message
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
    
    console.log('🔐 Verifying token...');
    
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/${process.env.STACK_PROJECT_ID}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
      },
      body: JSON.stringify({
        access_token: token
      })
    });

    console.log('📥 Token verification status:', authResponse.status);
    
    const responseText = await authResponse.text();
    console.log('📥 Token verification raw response:', responseText);
    
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
        error: 'Invalid or expired token',
        details: result
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
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`✅ Neon Auth status: https://healthscanqr-backend.onrender.com/api/neon-auth/status`);
  console.log(`🎉 Debug version deployed!`);
});
