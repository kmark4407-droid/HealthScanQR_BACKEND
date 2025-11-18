// index.js - CLEAN VERSION (NO FIREBASE ADMIN)
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

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/admin', adminRoutes);

// =============================================
// 🎯 CORE ENDPOINTS
// =============================================

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'HealthScan QR API Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    email_verification: '✅ ACTIVE'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API test endpoint is working! 🎉'
  });
});

// ✅ VERIFICATION CALLBACK ENDPOINT (CRITICAL FOR EMAIL VERIFICATION)
app.get('/api/verify-callback', async (req, res) => {
  try {
    const { email, oobCode } = req.query;

    console.log('🎯 VERIFICATION CALLBACK RECEIVED:', { email, oobCode: oobCode ? 'present' : 'missing' });

    if (!email) {
      console.log('❌ No email provided in callback');
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email');
    }

    // Import the email service
    const { default: firebaseEmailService } = await import('./services/firebase-email-service.js');

    let verifiedEmail = email;

    // If OOB code is provided, verify it first
    if (oobCode) {
      console.log('🔐 Verifying OOB code...');
      const verificationResult = await firebaseEmailService.verifyOobCode(oobCode);
      
      if (verificationResult.success) {
        console.log('✅ OOB code verified successfully');
        verifiedEmail = verificationResult.email || email;
      } else {
        console.log('❌ OOB code verification failed, using provided email');
      }
    }

    // Update database verification status
    console.log('🔄 Updating database for:', verifiedEmail);
    const dbResult = await firebaseEmailService.handleVerificationCallback(verifiedEmail);

    if (dbResult.success) {
      console.log('✅ DATABASE UPDATED - Email verified:', verifiedEmail);
      res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(verifiedEmail)}`);
    } else {
      console.log('❌ Database update failed');
      res.redirect(`https://healthscanqr2025.vercel.app/login?verification_error=database_failed`);
    }

  } catch (err) {
    console.error('❌ Verification callback error:', err.message);
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

// Catch-all handler
app.all('*', (req, res) => {
  console.log(`⚠️ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    available_endpoints: [
      'GET /api/health',
      'GET /api/test',
      'GET /api/verify-callback (Email verification)',
      'POST /api/manual-sync-verification',
      'POST /api/quick-verify',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: https://healthscanqr-backend.onrender.com/api/health`);
  console.log(`🎉 EMAIL VERIFICATION SYSTEM READY!`);
  console.log(`📧 Verification callback: /api/verify-callback`);
  console.log(`🔗 Set Firebase Action URL to:`);
  console.log(`   https://healthscanqr-backend.onrender.com/api/verify-callback?email=%%email%%`);
});
