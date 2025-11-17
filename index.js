// index.js - FINAL FIXED VERSION WITH WORKING BODY PARSING
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

// **FIX: Body parsing middleware MUST come first**
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// **FIX: Enhanced CORS configuration**
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'https://healthscanqr2025.vercel.app',
    'https://health-scan-qr2025.vercel.app',
    'https://reqbin.com',
    'https://hoppscotch.io'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// **FIX: Handle preflight requests properly**
app.options('*', cors());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ USE ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 FIXED NEON AUTH WITH MANUAL BODY PARSING
// =============================================

// Test endpoint with manual body parsing
app.post('/api/test-body', (req, res) => {
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
      message: 'Body parsing test',
      expressParsed: req.body,
      manuallyParsed: manuallyParsed,
      rawBody: rawBody,
      rawBodyLength: rawBody.length
    });
  });
});

// Working Neon Auth Register with manual body parsing
app.post('/api/neon-auth/register', (req, res) => {
  let rawBody = '';
  
  // Capture raw body data
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      console.log('🔐 REGISTER - Raw body:', rawBody);
      
      let bodyData = req.body;
      
      // If Express didn't parse it, try manual parsing
      if (rawBody && (!req.body || Object.keys(req.body).length === 0)) {
        try {
          bodyData = JSON.parse(rawBody);
          console.log('🔐 REGISTER - Manually parsed:', bodyData);
        } catch (parseError) {
          console.error('🔐 REGISTER - Parse error:', parseError);
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON data',
            rawBody: rawBody
          });
        }
      }
      
      const { email, password, name } = bodyData;
      
      // Validate input
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: 'Email, password, and name are required',
          received: bodyData,
          rawBody: rawBody,
          rawBodyLength: rawBody.length
        });
      }
      
      console.log('📤 Calling Neon Auth API for:', email);
      
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
      console.log('📥 Neon Auth response status:', authResponse.status);

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
});

// Working Neon Auth Login with manual body parsing
app.post('/api/neon-auth/login', (req, res) => {
  let rawBody = '';
  
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      console.log('🔐 LOGIN - Raw body:', rawBody);
      
      let bodyData = req.body;
      
      // Manual parsing fallback
      if (rawBody && (!req.body || Object.keys(req.body).length === 0)) {
        try {
          bodyData = JSON.parse(rawBody);
        } catch (parseError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON data'
          });
        }
      }
      
      const { email, password } = bodyData;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required',
          received: bodyData
        });
      }
      
      console.log('📤 Calling Neon Auth login for:', email);
      
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
      console.log('📥 Neon Auth login response status:', authResponse.status);

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
});

// Neon Auth status check
app.get('/api/neon-auth/status', (req, res) => {
  res.json({
    success: true,
    message: 'Neon Auth is ready with manual body parsing!',
    projectId: '565aeec4-a59c-4383-a9a1-0ae58a08959b',
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
      'POST /api/test-body',
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
  console.log(`🎉 Server started with MANUAL BODY PARSING!`);
});
