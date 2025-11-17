// index.js - FIXED VERSION WITH CORS PREFLIGHT SOLUTION
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

// **FIX: Body parsing middleware FIRST**
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// **FIX: Enhanced CORS configuration**
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'https://healthscanqr2025.vercel.app',
    'https://health-scan-qr2025.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// **FIX: Handle preflight requests explicitly**
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).send();
});

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

// **FIX: Add raw body parsing for debugging**
app.post('/api/neon-auth/register', (req, res, next) => {
  console.log('🔐 RAW Register request received');
  console.log('🔐 Headers:', req.headers);
  console.log('🔐 Method:', req.method);
  console.log('🔐 URL:', req.url);
  
  // Check if body is being parsed
  let bodyData = '';
  req.on('data', chunk => {
    bodyData += chunk.toString();
  });
  
  req.on('end', () => {
    console.log('🔐 RAW Body data:', bodyData);
    console.log('🔐 Parsed body by express:', req.body);
    
    // If we have raw data but express didn't parse it, parse it manually
    if (bodyData && (!req.body || Object.keys(req.body).length === 0)) {
      try {
        req.body = JSON.parse(bodyData);
        console.log('🔐 Manually parsed body:', req.body);
      } catch (e) {
        console.error('🔐 Manual parse error:', e);
      }
    }
    
    next();
  });
}, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    console.log('🔐 Final body for processing:', req.body);
    
    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
        received: { 
          email: email || 'missing', 
          password: password ? '***' : 'missing', 
          name: name || 'missing' 
        },
        rawBody: req.rawBody || 'not captured'
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
    
    // Use correct API endpoint with project ID in URL
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

    console.log('📥 Register response status:', authResponse.status);
    
    // Get raw response first to handle JSON parse errors
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
        rawResponse: responseText.substring(0, 200)
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

// **FIX: Simple test endpoint with raw body capture**
app.post('/api/neon-auth/simple-test', (req, res) => {
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  
  req.on('end', () => {
    console.log('🔍 SIMPLE TEST - Raw body:', rawBody);
    console.log('🔍 SIMPLE TEST - Parsed body:', req.body);
    console.log('🔍 SIMPLE TEST - Content-Type:', req.headers['content-type']);
    
    let parsedBody = {};
    try {
      if (rawBody) {
        parsedBody = JSON.parse(rawBody);
      }
    } catch (e) {
      console.error('🔍 SIMPLE TEST - Parse error:', e);
    }
    
    res.json({
      success: true,
      message: 'Simple test completed',
      rawBody: rawBody,
      parsedByExpress: req.body,
      manuallyParsed: parsedBody,
      headers: {
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length']
      }
    });
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
      'GET /api/neon-auth/test',
      'POST /api/neon-auth/simple-test', // NEW SIMPLE TEST
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
  console.log(`🎉 Server started with enhanced CORS!`);
});
