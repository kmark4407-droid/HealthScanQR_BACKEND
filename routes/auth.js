// routes/auth.js - COMPLETE WITH AUTOMATIC EMAIL VERIFICATION SYNC
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// ==================== FIREBASE TEST ENDPOINTS ====================

// ✅ TEST FIREBASE CONNECTION
router.post('/test-firebase', async (req, res) => {
  try {
    console.log('🧪 Testing Firebase connection...');
    
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const result = await firebaseEmailService.testFirebaseConnection();

    if (result.success) {
      res.json({
        success: true,
        message: '✅ Firebase connection is working!',
        details: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: '❌ Firebase connection failed',
        error: result.error
      });
    }

  } catch (err) {
    console.error('❌ Firebase test error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ TEST EMAIL DELIVERY
router.post('/test-email-delivery', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🧪 Testing email delivery to:', email);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const result = await firebaseEmailService.testEmailDelivery(email);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ Test email sent successfully! Please check your inbox and spam folder.',
        email: email,
        details: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: '❌ Test email failed',
        error: result.message
      });
    }

  } catch (err) {
    console.error('❌ Test email delivery error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Test failed: ' + err.message 
    });
  }
});

// ==================== REGISTRATION WITH EMAIL VERIFICATION ====================

// ✅ REGISTER - WITH EMAIL VERIFICATION
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
    console.log('🔄 Starting Firebase email process...');
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);

    console.log('📧 Email process result:', emailResult);

    if (emailResult.success && emailResult.emailSent) {
      // Email was sent successfully
      res.status(201).json({
        success: true,
        message: 'Registration successful! Please check your email for verification link.',
        user: newUser,
        emailSent: true,
        note: 'Click the verification link to activate your account'
      });
    } else {
      // Email failed but user was created
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

// ==================== VERIFICATION SYNC ENDPOINTS ====================

// ✅ CHECK AND SYNC VERIFICATION STATUS
router.post('/check-sync-verification', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    console.log('🔄 Checking and syncing verification for:', email);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    
    // Force sync verification status
    const syncResult = await firebaseEmailService.forceSyncVerification(email, password);

    if (syncResult.success && syncResult.emailVerified) {
      res.json({
        success: true,
        message: '✅ Email verified and synced! You can now login.',
        emailVerified: true,
        databaseUpdated: syncResult.databaseUpdated
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Email not verified yet. Please check your email and click the verification link.',
        emailVerified: false
      });
    }

  } catch (err) {
    console.error('❌ Check sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification sync' 
    });
  }
});

// ✅ AUTO-SYNC ON LOGIN ATTEMPT
router.post('/login-with-sync', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required.' 
      });
    }

    console.log('🔐 Login with sync attempt for:', email);

    // First, try normal login
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
      const syncResult = await firebaseEmailService.forceSyncVerification(email, password);
      
      if (syncResult.success && syncResult.emailVerified) {
        console.log('✅ Firebase verification found, user can now login');
        // Continue to generate token - user is now verified
      } else {
        console.log('❌ Email still not verified in Firebase');
        return res.status(403).json({
          success: false,
          message: 'Email not verified. Please check your email for verification link.',
          requiresVerification: true,
          email: user.email
        });
      }
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        emailVerified: true // Now verified
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
    console.error('❌ Login with sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

// ✅ BATCH SYNC FOR ALL USERS
router.post('/batch-sync-verifications', async (req, res) => {
  try {
    console.log('🔄 Starting batch sync for all users...');

    // Get all unverified users
    const unverifiedUsers = await pool.query(
      'SELECT id, email, password FROM users WHERE email_verified = false'
    );

    console.log(`📋 Found ${unverifiedUsers.rows.length} unverified users`);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const results = [];
    let syncedCount = 0;

    // Sync each user
    for (const user of unverifiedUsers.rows) {
      try {
        // Note: We don't have the plain password, so we can only check by email
        const firebaseUser = await firebaseEmailService.getFirebaseUserByEmail(user.email);
        
        if (firebaseUser.success && firebaseUser.emailVerified) {
          // Update database
          await pool.query(
            'UPDATE users SET email_verified = true WHERE id = $1',
            [user.id]
          );
          syncedCount++;
          results.push({ email: user.email, status: 'synced' });
          console.log('✅ Synced:', user.email);
        } else {
          results.push({ email: user.email, status: 'not_verified' });
        }
      } catch (error) {
        results.push({ email: user.email, status: 'error', error: error.message });
        console.log('❌ Error syncing:', user.email, error.message);
      }
    }

    res.json({
      success: true,
      message: `Batch sync completed. ${syncedCount} users synced.`,
      total: unverifiedUsers.rows.length,
      synced: syncedCount,
      results: results
    });

  } catch (err) {
    console.error('❌ Batch sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during batch sync' 
    });
  }
});

// ✅ GET FIREBASE USER INFO
router.post('/firebase-user-info', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔍 Getting Firebase user info for:', email);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const userInfo = await firebaseEmailService.getFirebaseUserByEmail(email);

    if (userInfo.success) {
      res.json({
        success: true,
        email: userInfo.email,
        emailVerified: userInfo.emailVerified,
        firebaseUid: userInfo.localId
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found in Firebase',
        error: userInfo.error
      });
    }

  } catch (err) {
    console.error('❌ Firebase user info error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error getting Firebase user info' 
    });
  }
});

// ==================== AUTOMATIC EMAIL VERIFICATION CALLBACKS ====================

// ✅ PRIMARY FIREBASE CALLBACK - USE THIS IN FIREBASE TEMPLATE
router.get('/firebase-verify-callback', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      console.log('❌ No email provided in Firebase callback');
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email');
    }

    console.log('🎯 FIREBASE VERIFICATION CALLBACK FOR:', email);

    // Update database to mark as verified
    const result = await pool.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found for email:', email);
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=user_not_found');
    }

    const user = result.rows[0];
    console.log('✅ EMAIL VERIFIED IN DATABASE:', email);
    console.log('✅ User details:', { id: user.id, email: user.email, verified: user.email_verified });

    // Redirect to frontend with success
    res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(email)}`);

  } catch (err) {
    console.error('❌ Firebase callback error:', err.message);
    res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=server_error');
  }
});

// ✅ ALTERNATIVE FIREBASE CALLBACK
router.get('/verify-email-callback', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=no_email');
    }

    console.log('📩 Alternative verification callback for:', email);

    // Update database to mark as verified
    const result = await pool.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found for email:', email);
      return res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=user_not_found');
    }

    console.log('✅ Email verified via alternative callback:', email);

    // Redirect to frontend with success
    res.redirect(`https://healthscanqr2025.vercel.app/login?verified=true&email=${encodeURIComponent(email)}`);

  } catch (err) {
    console.error('❌ Alternative callback error:', err.message);
    res.redirect('https://healthscanqr2025.vercel.app/login?verification_error=server_error');
  }
});

// ✅ POST CALLBACK FOR MANUAL SYNC
router.post('/verify-email-callback', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('📩 POST verification callback for:', email);

    // Update database to mark as verified
    const result = await pool.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Email verified via POST callback:', email);

    res.json({
      success: true,
      message: '🎉 Email verified successfully! You can now login.',
      email: email,
      verified: true
    });

  } catch (err) {
    console.error('❌ POST callback error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification' 
    });
  }
});

// ==================== MANUAL VERIFICATION ENDPOINTS ====================

// ✅ RESEND VERIFICATION EMAIL
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('📧 Resending verification email to:', email);

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
    console.error('❌ Resend verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during resend' 
    });
  }
});

// ✅ QUICK VERIFY - INSTANT VERIFICATION
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
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
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
      message: '✅ QUICK VERIFICATION SUCCESS! User can now login.',
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

// ✅ MANUAL SYNC VERIFICATION
router.post('/manual-sync-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔧 Manual sync verification for:', email);

    const result = await pool.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Manual sync completed for:', email);

    res.json({
      success: true,
      message: '✅ Manual sync successful! User can now login.',
      user: result.rows[0],
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Manual sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during manual sync' 
    });
  }
});

// ==================== LOGIN WITH VERIFICATION CHECK ====================

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

    // CHECK EMAIL VERIFICATION
    if (!user.email_verified) {
      console.log('❌ Login blocked - email not verified for:', email);
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please check your email for verification link.',
        requiresVerification: true,
        email: user.email
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        emailVerified: user.email_verified 
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
        email_verified: user.email_verified
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

// ==================== VERIFICATION STATUS ENDPOINTS ====================

// ✅ GET VERIFICATION STATUS
router.get('/verification-status/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      'SELECT id, email, email_verified, firebase_uid, created_at FROM users WHERE email = $1',
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
      firebaseUid: user.firebase_uid,
      canLogin: user.email_verified,
      message: user.email_verified ? '✅ VERIFIED - Can login' : '❌ NOT VERIFIED - Cannot login'
    });

  } catch (err) {
    console.error('❌ Status check error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error checking status' 
    });
  }
});

// ✅ GET USER PROFILE
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    
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

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Profile error:', err.message);
    res.status(401).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
});

// ✅ GET ALL USERS (DEBUG)
router.get('/all-users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, email_verified, firebase_uid, created_at FROM users ORDER BY created_at DESC'
    );

    const verifiedCount = result.rows.filter(user => user.email_verified).length;
    const notVerifiedCount = result.rows.length - verifiedCount;

    res.json({
      success: true,
      totalUsers: result.rows.length,
      verifiedUsers: verifiedCount,
      notVerifiedUsers: notVerifiedCount,
      users: result.rows,
      message: `Found ${result.rows.length} users (${verifiedCount} verified, ${notVerifiedCount} not verified)`
    });

  } catch (err) {
    console.error('❌ All users error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error getting users' 
    });
  }
});

export default router;
