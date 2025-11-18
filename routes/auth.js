// routes/auth.js - COMPLETE REVISED VERSION
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// ==================== REGISTRATION ====================

router.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password } = req.body;

    if (!full_name || !email || !username || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required.' 
      });
    }

    console.log('📝 REGISTRATION ATTEMPT FOR:', email);

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        success: false,
        message: 'Email or username already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user - START AS UNVERIFIED
    const result = await pool.query(
      `INSERT INTO users (full_name, email, username, password, email_verified, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) 
       RETURNING id, full_name, email, username, email_verified, created_at`,
      [full_name, email, username, hashedPassword, false]
    );

    const newUser = result.rows[0];
    console.log('✅ User registered in database (unverified):', email);

    // Send verification email via Firebase
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);

    if (emailResult.success && emailResult.emailSent) {
      res.status(201).json({
        success: true,
        message: 'Registration successful! Please check your email for verification link.',
        user: newUser,
        emailSent: true
      });
    } else {
      res.status(201).json({
        success: true,
        message: 'Registration completed but email verification failed. Please use resend verification.',
        user: newUser,
        emailSent: false
      });
    }

  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration: ' + err.message 
    });
  }
});

// ==================== LOGIN ====================

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required.' 
      });
    }

    console.log('🔐 Login attempt for:', email);

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // If email is not verified, check Firebase status
    if (!user.email_verified) {
      console.log('🔄 Email not verified, checking Firebase status...');
      
      const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
      const syncResult = await firebaseEmailService.checkUserVerification(email, password);
      
      if (syncResult.success && syncResult.emailVerified) {
        console.log('✅ Firebase verification found, proceeding with login');
        // User is now verified, continue with login
      } else {
        console.log('❌ Email still not verified');
        return res.status(403).json({
          success: false,
          message: 'Email not verified. Please check your email for verification link.',
          requiresVerification: true,
          email: user.email
        });
      }
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        emailVerified: true
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful for:', email);

    res.json({
      success: true,
      message: '✅ Login successful!',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        email_verified: true
      }
    });

  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

// ==================== USER PROFILE ====================

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, full_name, email, username, email_verified, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        email_verified: user.email_verified,
        created_at: user.created_at
      }
    });

  } catch (err) {
    console.error('❌ Profile endpoint error:', err.message);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error retrieving profile' 
    });
  }
});

// ==================== VERIFICATION ENDPOINTS ====================

// ✅ RESEND VERIFICATION
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('📧 Resending verification to:', email);

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is already verified' 
      });
    }

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const tempPassword = 'resend-' + Date.now();
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, tempPassword, user.id);

    if (emailResult.success && emailResult.emailSent) {
      res.json({ 
        success: true,
        message: '✅ Verification email sent successfully.',
        emailSent: true
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email.',
        emailSent: false
      });
    }

  } catch (err) {
    console.error('❌ Resend error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during resend' 
    });
  }
});

// ✅ CHECK AND SYNC VERIFICATION
router.post('/check-sync-verification', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    console.log('🔄 Manual sync verification for:', email);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
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
    console.error('❌ Sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification sync' 
    });
  }
});

// ✅ QUICK VERIFY (ADMIN)
router.post('/quick-verify', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('⚡ Quick verify for:', email);

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
      message: '✅ QUICK VERIFICATION SUCCESS!',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Quick verify error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during quick verify' 
    });
  }
});

// ✅ VERIFICATION STATUS
router.get('/verification-status/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      'SELECT id, email, email_verified, firebase_uid FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      email: user.email,
      emailVerified: user.email_verified,
      canLogin: user.email_verified
    });

  } catch (err) {
    console.error('❌ Status check error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error checking status' 
    });
  }
});

// ==================== FIREBASE VERIFICATION CALLBACKS ====================

// ✅ FIREBASE VERIFICATION CALLBACK (MAIN SOLUTION)
router.get('/firebase-verify-callback', async (req, res) => {
  try {
    const { email, oobCode } = req.query;

    console.log('🎯 FIREBASE VERIFICATION CALLBACK RECEIVED:', { email, oobCode: oobCode ? 'present' : 'missing' });

    if (!email) {
      console.log('❌ No email provided');
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email');
    }

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');

    // If OOB code is provided, verify it first
    if (oobCode) {
      console.log('🔐 Verifying OOB code...');
      const verificationResult = await firebaseEmailService.verifyOobCode(oobCode);
      
      if (verificationResult.success) {
        console.log('✅ OOB code verified successfully');
        // Use the email from verification result (more reliable)
        const verifiedEmail = verificationResult.email || email;
        await updateDatabaseVerification(verifiedEmail);
        
        return res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(verifiedEmail)}`);
      } else {
        console.log('❌ OOB code verification failed, but still trying to update database with provided email');
      }
    }

    // Update database with provided email
    await updateDatabaseVerification(email);
    
    // Redirect to frontend with success
    res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(email)}`);

  } catch (err) {
    console.error('❌ Firebase callback error:', err.message);
    res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=server_error');
  }
});

// ==================== HELPER FUNCTIONS ====================

// Helper function to update database verification
async function updateDatabaseVerification(email) {
  try {
    const result = await pool.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found for email:', email);
      return false;
    }

    const user = result.rows[0];
    console.log('✅ EMAIL VERIFIED IN DATABASE:', email);
    console.log('✅ User verification status:', user.email_verified);
    return true;
  } catch (error) {
    console.log('❌ Database update error:', error.message);
    return false;
  }
}

// ==================== TEST ENDPOINTS ====================

// ✅ TEST AUTH ENDPOINT
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Auth routes are working!',
    endpoints: [
      'POST /register',
      'POST /login', 
      'GET /me',
      'POST /resend-verification',
      'POST /check-sync-verification',
      'POST /quick-verify',
      'GET /verification-status/:email',
      'GET /firebase-verify-callback'
    ]
  });
});

export default router;
