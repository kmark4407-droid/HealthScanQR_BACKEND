// index.js - SUPER SIMPLE WORKING VERSION
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

// Basic CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ USE ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 SUPER SIMPLE TEST ENDPOINT
// =============================================

// Test endpoint that WILL work
app.post('/api/simple-test', (req, res) => {
  console.log('📨 SIMPLE TEST - Headers:', req.headers);
  console.log('📨 SIMPLE TEST - Body:', req.body);
  console.log('📨 SIMPLE TEST - Method:', req.method);
  console.log('📨 SIMPLE TEST - URL:', req.url);
  
  res.json({
    success: true,
    message: 'Simple test endpoint',
    yourData: req.body,
    method: req.method,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });
});

// =============================================
// 🎯 WORKING NEON AUTH ENDPOINTS
// =============================================

// Simple Neon Auth Register
app.post('/api/neon-auth/register', async (req, res) => {
  try {
    console.log('🔐 REGISTER - Body:', req.body);
    
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required in JSON format',
        example: {
          email: "user@example.com",
          password: "SecurePass123!",
          name: "John Doe"
        }
      });
    }
    
    console.log('📤 Registering user:', email);
    
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

    if (authResponse.ok) {
      res.json({
        success: true,
        message: 'User registered successfully!',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.display_name
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Registration failed'
      });
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Simple Neon Auth Login
app.post('/api/neon-auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
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

    if (authResponse.ok) {
      res.json({
        success: true,
        message: 'Login successful!',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.display_name
        },
        access_token: result.tokens.access_token
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.message || 'Login failed'
      });
    }
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// =============================================
// ✅ EXISTING ROUTES
// =============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

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

app.all('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /api/health',
      'POST /api/simple-test',
      'POST /api/neon-auth/register',
      'POST /api/neon-auth/login'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Neon Auth: ${process.env.STACK_PROJECT_ID ? 'READY' : 'NOT CONFIGURED'}`);
});
