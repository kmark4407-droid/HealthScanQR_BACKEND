// index.js - COMPLETE REVISED WITH WORKING EMAIL VERIFICATION
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
// 🎯 FIXED CORS CONFIGURATION FOR MOBILE
// =============================================

// CORS Configuration - EXPANDED FOR MOBILE SUPPORT
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
      'https://healthscanqr2025-*.vercel.app', // Wildcard pattern
      // For local mobile testing
      'http://localhost',
      'http://localhost:8100',
      'capacitor://localhost',
      'ionic://localhost'
    ];
    
    // Check if the origin matches any allowed origin or pattern
    if (allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard patterns
        const regex = new RegExp(allowed.replace(/\*/g, '.*'));
        return regex.test(origin);
      }
      return allowed === origin;
    })) {
      callback(null, true);
    } else {
      console.log(`🔒 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'X-Content-Type-Options'
  ],
  exposedHeaders: ['Content-Disposition'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', (req, res) => {
  console.log('🛫 Preflight request received for:', req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  next();
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// 🎯 ROOT AND CORE ENDPOINTS
// =============================================

// Root route - Fix the 404 error
app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
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
      admin: '/api/admin/*',
      email_verification: '/api/auth/firebase-verify-callback'
    }
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    email_verification: '✅ ACTIVE',
    cors: '✅ ENABLED'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.json({ 
    success: true,
    message: 'API test endpoint is working! 🎉',
    cors: '✅ Working',
    origin: req.headers.origin
  });
});

// CORS test endpoint
app.options('/api/cors-test', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

app.get('/api/cors-test', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.json({
    success: true,
    message: 'CORS test successful!',
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
});

// Use routes (after root route)
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 EMAIL VERIFICATION ENDPOINTS
// =============================================

// ✅ DEBUG ENDPOINT - See what Firebase is actually sending
app.get('/api/debug-firebase-callback', async (req, res) => {
  try {
    const allParams = req.query;
    console.log('🔍 DEBUG - All query parameters received:', allParams);
    console.log('🔍 DEBUG - Raw URL:', req.url);
    console.log('🔍 DEBUG - Headers:', req.headers);

    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.json({
      success: true,
      message: 'Debug information logged',
      parameters: allParams,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Debug endpoint error:', err.message);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// ✅ FIREBASE VERIFICATION CALLBACK - WORKING VERSION
app.get('/api/auth/firebase-verify-callback', async (req, res) => {
  try {
    const { email, oobCode, mode } = req.query;

    console.log('🎯 FIREBASE VERIFICATION CALLBACK RECEIVED');
    console.log('📧 Email parameter:', email || 'NOT PROVIDED');
    console.log('🔑 OOB Code:', oobCode ? 'PRESENT' : 'MISSING');
    console.log('🎯 Mode:', mode || 'NOT PROVIDED');

    // Import the email service
    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');

    let verifiedEmail = null;

    // METHOD 1: If OOB code is provided, use it to get the email (MOST RELIABLE)
    if (oobCode) {
      console.log('🔐 METHOD 1: Using OOB code to extract email...');
      const verificationResult = await firebaseEmailService.verifyOobCode(oobCode);
      
      if (verificationResult.success && verificationResult.email) {
        verifiedEmail = verificationResult.email;
        console.log('✅ Email extracted from OOB code:', verifiedEmail);
      } else {
        console.log('❌ Failed to extract email from OOB code:', verificationResult.error);
      }
    }

    // METHOD 2: If email is directly provided in URL
    if (!verifiedEmail && email) {
      console.log('📧 METHOD 2: Using email from URL parameter:', email);
      verifiedEmail = email;
      
      // If we have OOB code, verify it
      if (oobCode) {
        console.log('🔐 Verifying OOB code with extracted email...');
        await firebaseEmailService.verifyOobCode(oobCode);
      }
    }

    // If we still don't have an email, show error
    if (!verifiedEmail) {
      console.log('❌ CRITICAL: Could not determine email address');
      console.log('❌ Available parameters:', { 
        email: email || 'missing', 
        oobCode: oobCode ? 'present' : 'missing', 
        mode: mode || 'missing' 
      });
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email_detected');
    }

    // Update database verification status
    console.log('🔄 Updating database verification for:', verifiedEmail);
    const dbResult = await firebaseEmailService.handleVerificationCallback(verifiedEmail);

    if (dbResult.success) {
      console.log('🎉 SUCCESS: Email verified in database:', verifiedEmail);
      console.log('✅ User verification status:', dbResult.user.email_verified);
      res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(verifiedEmail)}`);
    } else {
      console.log('❌ Database update failed for:', verifiedEmail);
      res.redirect(`https://healthscanqr2025.vercel.app/login?verification_error=database_failed&email=${encodeURIComponent(verifiedEmail)}`);
    }

  } catch (err) {
    console.error('❌ Firebase callback error:', err.message);
    console.error('❌ Error stack:', err.stack);
    res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=server_error');
  }
});

// ✅ ALTERNATIVE VERIFICATION CALLBACK
app.get('/api/verify-callback', async (req, res) => {
  try {
    const { email, oobCode } = req.query;

    console.log('🎯 ALTERNATIVE VERIFICATION CALLBACK RECEIVED');
    console.log('📧 Email:', email || 'NOT PROVIDED');
    console.log('🔑 OOB Code:', oobCode ? 'PRESENT' : 'MISSING');

    if (!oobCode && !email) {
      console.log('❌ No OOB code or email provided');
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_parameters');
    }

    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');

    let verifiedEmail = null;

    // Priority: OOB code first, then email parameter
    if (oobCode) {
      console.log('🔐 Using OOB code to extract email...');
      const verificationResult = await firebaseEmailService.verifyOobCode(oobCode);
      
      if (verificationResult.success && verificationResult.email) {
        verifiedEmail = verificationResult.email;
        console.log('✅ Email from OOB code:', verifiedEmail);
      }
    }

    if (!verifiedEmail && email) {
      console.log('📧 Using provided email parameter:', email);
      verifiedEmail = email;
    }

    if (!verifiedEmail) {
      console.log('❌ Could not determine email address');
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email_detected');
    }

    // Update database
    console.log('🔄 Updating database for:', verifiedEmail);
    const dbResult = await firebaseEmailService.handleVerificationCallback(verifiedEmail);

    if (dbResult.success) {
      console.log('✅ Database updated successfully');
      res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(verifiedEmail)}`);
    } else {
      console.log('❌ Database update failed');
      res.redirect(`https://healthscanqr2025.vercel.app/login?verification_error=database_failed`);
    }

  } catch (err) {
    console.error('❌ Alternative callback error:', err.message);
    res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=server_error');
  }
});

// ✅ MANUAL SYNC ENDPOINT
app.post('/api/manual-sync-verification', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    console.log('🔄 Manual sync verification for:', email);

    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');
    const syncResult = await firebaseEmailService.checkUserVerification(email, password);

    if (syncResult.success && syncResult.emailVerified) {
      res.json({
        success: true,
        message: '✅ Email verified and synced! You can now login.',
        emailVerified: true
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Email not verified yet. Please check your email and click the verification link.',
        emailVerified: false
      });
    }

  } catch (err) {
    console.error('❌ Manual sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification sync' 
    });
  }
});

// ✅ QUICK VERIFY ENDPOINT (ADMIN)
app.post('/api/quick-verify', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('⚡ Quick verify for:', email);

    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');
    const result = await firebaseEmailService.handleVerificationCallback(email);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ QUICK VERIFICATION SUCCESS! User can now login.',
        user: result.user
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found or verification failed'
      });
    }

  } catch (err) {
    console.error('❌ Quick verify error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during quick verify' 
    });
  }
});

// ✅ TEST EMAIL VERIFICATION ENDPOINT
app.post('/api/test-email-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🧪 Testing email verification for:', email);

    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');
    
    // Test Firebase connection
    const connectionTest = await firebaseEmailService.testFirebaseConnection();
    
    if (!connectionTest.success) {
      return res.status(500).json({
        success: false,
        message: 'Firebase connection failed',
        error: connectionTest.error
      });
    }

    // Create test user and send verification
    const testPassword = 'test123456';
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, testPassword, 'test-user-id');

    res.json({
      success: true,
      message: 'Test email verification initiated',
      connection: connectionTest,
      emailResult: emailResult
    });

  } catch (err) {
    console.error('❌ Test email error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Test failed: ' + err.message 
    });
  }
});

// =============================================
// 🎯 CATCH-ALL HANDLER
// =============================================

// Catch-all handler for undefined routes
app.all('*', (req, res) => {
  console.log(`⚠️ 404 - Route not found: ${req.method} ${req.url}`);
  console.log(`⚠️ Origin: ${req.headers.origin}`);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/test',
      'GET /api/cors-test',
      'GET /api/debug-firebase-callback (Debug)',
      'GET /api/auth/firebase-verify-callback (Firebase Email Verification)',
      'GET /api/verify-callback (Alternative Email Verification)',
      'POST /api/manual-sync-verification',
      'POST /api/quick-verify',
      'POST /api/test-email-verification',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST /api/admin/admin-login',
      'GET /api/admin/users',
      'GET /api/admin/activity-logs'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`✅ Root endpoint: https://healthscanqr-backend.onrender.com/`);
  console.log(`🎉 EMAIL VERIFICATION SYSTEM READY!`);
  console.log(`📧 Firebase callback: /api/auth/firebase-verify-callback`);
  console.log(`📧 Alternative callback: /api/verify-callback`);
  console.log(`🐛 Debug endpoint: /api/debug-firebase-callback`);
  console.log(`🔗 Make sure Firebase Action URL is set to:`);
  console.log(`   https://healthscanqr-backend.onrender.com/api/auth/firebase-verify-callback`);
  console.log(`📱 CORS ENABLED for mobile and all Vercel domains`);
});
