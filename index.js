// index.js - FIXED VERSION WITH WORKING NEON AUTH
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
// 🎯 FIXED NEON AUTH IMPLEMENTATION
// =============================================

// Test Neon Auth configuration
app.get('/api/neon-auth/test', (req, res) => {
  res.json({
    success: true,
    message: "Neon Auth is configured and ready!",
    environment: {
      projectId: process.env.STACK_PROJECT_ID ? '✅ Set' : '❌ Missing',
      secretKey: process.env.STACK_SECRET_SERVER_KEY ? '✅ Set' : '❌ Missing',
      databaseUrl: process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'
    },
    endpoints: {
      register: 'POST /api/neon-auth/register',
      login: 'POST /api/neon-auth/login',
      profile: 'GET /api/neon-auth/me'
    },
    timestamp: new Date().toISOString()
  });
});

// FIXED Neon Auth Register
app.post('/api/neon-auth/register', async (req, res) => {
  try {
    console.log('🔐 Register request body:', req.body);
    
    const { email, password, name } = req.body;
    
    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
        received: { email: !!email, password: !!password, name: !!name }
      });
    }
    
    console.log('🔐 Neon Auth Register attempt:', email);
    
    // Check if environment variables are set
    if (!process.env.STACK_PROJECT_ID || !process.env.STACK_SECRET_SERVER_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Neon Auth not configured properly'
      });
    }

    console.log('📤 Sending registration to Neon Auth API...');
    
    // FIXED: Use correct API endpoint with project ID in URL
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/${process.env.STACK_PROJECT_ID}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
        // REMOVED: 'X-Project-Id' header - not needed when in URL
      },
      body: JSON.stringify({
        email: email,
        password: password,
        display_name: name,
        email_verified: false
      })
    });

    console.log('📥 Register response status:', authResponse.status);
    
    // FIXED: Get raw response first to handle JSON parse errors
    const responseText = await authResponse.text();
    console.log('📥 Raw register response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from authentication service',
        rawResponse: responseText.substring(0, 200) // First 200 chars for debugging
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
      message: 'User registered successfully with Neon Auth!',
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.display_name
      }
    });
    
  } catch (error) {
    console.error('❌ Neon Auth registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// FIXED Neon Auth Login
app.post('/api/neon-auth/login', async (req, res) => {
  try {
    console.log('🔐 Login request body:', req.body);
    
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        received: { email: !!email, password: !!password }
      });
    }
    
    console.log('🔐 Neon Auth Login attempt:', email);
    
    if (!process.env.STACK_PROJECT_ID || !process.env.STACK_SECRET_SERVER_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Neon Auth not configured'
      });
    }

    console.log('📤 Sending login to Neon Auth API...');
    
    // FIXED: Use correct API endpoint with project ID in URL
    const authResponse = await fetch(`https://api.stack-auth.com/api/v1/projects/${process.env.STACK_PROJECT_ID}/auth/email-password/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STACK_SECRET_SERVER_KEY}`
        // REMOVED: 'X-Project-Id' header - not needed when in URL
      },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    console.log('📥 Login response status:', authResponse.status);
    
    // FIXED: Get raw response first to handle JSON parse errors
    const responseText = await authResponse.text();
    console.log('📥 Raw login response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from authentication service',
        rawResponse: responseText.substring(0, 200)
      });
    }

    if (!authResponse.ok) {
      console.error('❌ Neon Auth login error:', result);
      return res.status(401).json({
        success: false,
        error: result.message || 'Invalid email or password',
        details: result,
        status: authResponse.status
      });
    }

    console.log('✅ Login successful for user:', result.user?.id);

    res.json({
      success: true,
      message: 'Login successful with Neon Auth!',
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.display_name
      },
      access_token: result.tokens?.access_token,
      refresh_token: result.tokens?.refresh_token
    });
    
  } catch (error) {
    console.error('❌ Neon Auth login error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// FIXED Neon Auth Token Verification
app.get('/api/neon-auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    console.log('🔐 Token verification attempt');
    
    // FIXED: Use correct API endpoint with project ID in URL
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
    
    // FIXED: Get raw response first
    const responseText = await authResponse.text();
    console.log('📥 Raw verification response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from token verification',
        rawResponse: responseText.substring(0, 200)
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
      message: 'Token verified successfully!',
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
      'GET /api/neon-auth/test',
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
  console.log(`✅ Neon Auth test: https://healthscanqr-backend.onrender.com/api/neon-auth/test`);
  console.log(`🎉 Neon Auth is READY!`);
});
