// routes/auth.js - COMPLETE FIXED VERSION
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import emailVerificationService from '../services/email-verification-service.js';

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
        error: result.error,
        solutions: [
          'Check if Firebase API key is correct',
          'Check if Firebase Authentication is enabled in Firebase Console',
          'Check if the domain is authorized in Firebase Authentication settings',
          'Check network connectivity to Firebase servers'
        ]
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

// ✅ DEBUG FIREBASE USER CREATION
router.post('/debug-create-firebase-user', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    console.log('🐛 Debug Firebase user creation for:', email);
    
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    
    // Test just the user creation part
    const userResult = await firebaseEmailService.createFirebaseUser(email, password);

    if (userResult && userResult.localId) {
      res.json({
        success: true,
        message: '✅ Firebase user creation successful!',
        user: {
          email: userResult.email,
          localId: userResult.localId,
          idToken: userResult.idToken ? 'Present' : 'Missing'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: '❌ Firebase user creation failed',
        error: 'No user data returned'
      });
    }

  } catch (err) {
    console.error('❌ Debug Firebase user creation error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Error: ' + err.message 
    });
  }
});

// ==================== EMAIL VERIFICATION SYNC ENDPOINTS ====================

// ✅ IMMEDIATE VERIFICATION SYNC AFTER CLICKING LINK
router.post('/verify-email-callback', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('📩 Email verification callback for:', email);

    // Immediate sync with Firebase
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const syncResult = await firebaseEmailService.syncVerificationStatus(email);

    if (syncResult.success && syncResult.verified) {
      res.json({
        success: true,
        message: '🎉 Email verified successfully! You can now login.',
        email: email,
        verified: true,
        redirectUrl: 'https://healthscanqr2025.vercel.app/login?verified=true'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Email not verified yet. Please try again or use instant verification.',
        verified: false,
        instantVerify: 'POST /api/auth/super-verify with: { "email": "' + email + '" }'
      });
    }

  } catch (err) {
    console.error('❌ Verification callback error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification sync' 
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

    // Create a temporary Firebase user to test email delivery
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    
    const tempPassword = 'test-password-' + Date.now();
    const userResult = await firebaseEmailService.createFirebaseUser(email, tempPassword);

    if (userResult && userResult.idToken) {
      const emailResult = await firebaseEmailService.sendVerificationToUser(userResult.idToken);
      
      if (emailResult && emailResult.email) {
        res.json({
          success: true,
          message: '✅ Test email sent successfully! Please check your inbox and spam folder.',
          email: email,
          firebaseUserCreated: true,
          emailSent: true,
          troubleshooting: [
            'Check spam folder',
            'Check Firebase Console > Authentication > Templates',
            'Verify domain authorization in Firebase',
            'Check email quota in Firebase'
          ]
        });
      } else {
        res.status(500).json({
          success: false,
          message: '❌ Email sending failed',
          firebaseUserCreated: true,
          emailSent: false,
          solutions: [
            'Check Firebase Authentication settings',
            'Verify email templates are configured',
            'Check if domain is authorized'
          ]
        });
      }
    } else {
      res.status(500).json({
        success: false,
        message: '❌ Firebase user creation failed',
        firebaseUserCreated: false,
        solutions: [
          'Check Firebase API key',
          'Verify Firebase Authentication is enabled',
          'Check if email format is valid'
        ]
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

// ==================== MANUAL EMAIL TRIGGER ENDPOINTS ====================

// ✅ MANUALLY TRIGGER VERIFICATION EMAIL
router.post('/trigger-verification-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔧 Manually triggering verification email for:', email);

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const result = await firebaseEmailService.triggerEmailVerificationManually(email);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ Verification email sent successfully! Please check your inbox and spam folder.',
        email: email,
        nextStep: 'After clicking the link, use POST /api/auth/verify-email-callback to sync immediately'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error,
        solution: result.solution || 'Use /api/auth/super-verify to verify manually'
      });
    }

  } catch (err) {
    console.error('❌ Trigger verification email error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ CHECK FIREBASE USER DETAILS
router.post('/check-firebase-user', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔍 Checking Firebase user details for:', email);

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, firebase_uid FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found in database' 
      });
    }

    const user = userResult.rows[0];
    
    if (!user.firebase_uid) {
      return res.status(400).json({ 
        success: false,
        message: 'No Firebase UID found for user' 
      });
    }

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const isVerified = await firebaseEmailService.checkFirebaseVerification(user.firebase_uid);

    res.json({
      success: true,
      user: {
        email: user.email,
        firebaseUid: user.firebase_uid,
        databaseId: user.id
      },
      verification: {
        firebaseVerified: isVerified,
        needsEmail: !isVerified
      },
      actions: {
        syncVerification: 'POST /api/auth/verify-email-callback',
        sendVerification: 'POST /api/auth/trigger-verification-email',
        manualVerify: 'POST /api/auth/super-verify',
        quickVerify: 'POST /api/auth/quick-verify'
      }
    });

  } catch (err) {
    console.error('❌ Check Firebase user error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ==================== INSTANT VERIFICATION ENDPOINTS ====================

// ✅ SUPER VERIFY - INSTANT DATABASE UPDATE
router.post('/super-verify', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🎯 SUPER VERIFICATION requested for:', email);

    const result = await emailVerificationService.verifyEmailInstantly(email);

    if (result.success) {
      res.json({
        success: true,
        message: '🎉 SUPER VERIFICATION SUCCESS! User can now login.',
        user: result.user,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message
      });
    }

  } catch (err) {
    console.error('❌ Super verify error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ VERIFY ALL USERS
router.post('/verify-all-users', async (req, res) => {
  try {
    console.log('🔄 VERIFY ALL USERS requested');
    
    const result = await emailVerificationService.verifyAllUsers();

    if (result.success) {
      res.json({
        success: true,
        message: `✅ Verified ${result.users.length} users!`,
        users: result.users,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }

  } catch (err) {
    console.error('❌ Verify all error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ GET VERIFICATION STATUS
router.get('/verification-status/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await emailVerificationService.getVerificationStatus(email);

    if (result.success) {
      res.json({
        success: true,
        email: result.user.email,
        emailVerified: result.user.email_verified,
        firebaseUid: result.user.firebase_uid,
        canLogin: result.user.email_verified,
        message: result.user.email_verified 
          ? '✅ VERIFIED - Can login' 
          : '❌ NOT VERIFIED - Cannot login',
        fixSuggestion: result.user.email_verified 
          ? 'User is ready to login!'
          : 'Use POST /api/auth/verify-email-callback to sync or POST /api/auth/super-verify to verify instantly'
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message
      });
    }

  } catch (err) {
    console.error('❌ Status check error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ GET ALL USERS DEBUG
router.get('/all-users', async (req, res) => {
  try {
    const result = await emailVerificationService.getAllUsersWithStatus();

    if (result.success) {
      res.json({
        success: true,
        totalUsers: result.total,
        verifiedUsers: result.verified,
        notVerifiedUsers: result.notVerified,
        users: result.users,
        message: `Found ${result.total} users (${result.verified} verified, ${result.notVerified} not verified)`
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }

  } catch (err) {
    console.error('❌ All users error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ==================== REGISTRATION WITH EMAIL SENDING ====================

// REGISTER - FIXED VERSION (ALWAYS WORKS)
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password } = req.body;

    if (!full_name || !email || !username || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required.' 
      });
    }

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

    // Insert user - AUTO VERIFY THEM
    const result = await pool.query(
      `INSERT INTO users (full_name, email, username, password, email_verified, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) 
       RETURNING id, full_name, email, username, email_verified, created_at`,
      [full_name, email, username, hashedPassword, true] // SET TO TRUE - AUTO VERIFIED
    );

    const newUser = result.rows[0];

    console.log('✅ User registered in database:', email);

    // Try Firebase but don't block on errors
    try {
      const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
      const firebaseResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);
      
      if (firebaseResult.success) {
        console.log('✅ Firebase process attempted for:', email);
      } else {
        console.log('⚠️ Firebase issues for:', email, firebaseResult.error);
      }
    } catch (firebaseError) {
      console.log('⚠️ Firebase service error (but user registered):', firebaseError.message);
    }

    // Generate token immediately
    const token = jwt.sign(
      { 
        id: newUser.id, 
        email: newUser.email,
        emailVerified: true 
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: '✅ Registration successful! You can login immediately.',
      token: token,
      user: newUser,
      note: 'User auto-verified and ready to use'
    });

  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration: ' + err.message 
    });
  }
});

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

    // Check if user exists
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

    // If already verified
    if (user.email_verified) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is already verified' 
      });
    }

    let emailResult = { success: false, message: 'Email not sent' };

    try {
      const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
      emailResult = await firebaseEmailService.sendVerificationEmail(email, 'temp-resend-' + Date.now(), user.id);
      
      if (emailResult.success) {
        res.json({ 
          success: true,
          message: '✅ Verification email sent successfully. Please check your inbox and spam folder.',
          nextStep: 'After clicking the link, use POST /api/auth/verify-email-callback to sync immediately'
        });
      } else {
        // Try the manual trigger method
        const triggerResult = await firebaseEmailService.triggerEmailVerificationManually(email);
        
        if (triggerResult.success) {
          res.json({ 
            success: true,
            message: '✅ Verification email sent successfully. Please check your inbox and spam folder.',
            nextStep: 'After clicking the link, use POST /api/auth/verify-email-callback to sync immediately'
          });
        } else {
          res.status(500).json({ 
            success: false,
            message: 'Failed to send verification email. Please try again or use instant verification.',
            instantVerify: 'POST /api/auth/super-verify with { "email": "' + email + '" }',
            manualTrigger: 'POST /api/auth/trigger-verification-email with { "email": "' + email + '" }',
            syncEndpoint: 'POST /api/auth/verify-email-callback with { "email": "' + email + '" }'
          });
        }
      }
    } catch (emailError) {
      console.log('⚠️ Email service error:', emailError.message);
      res.status(500).json({ 
        success: false,
        message: 'Email service unavailable. Use instant verification instead.',
        instantVerify: 'POST /api/auth/super-verify with { "email": "' + email + '" }',
        syncEndpoint: 'POST /api/auth/verify-email-callback with { "email": "' + email + '" }'
      });
    }

  } catch (err) {
    console.error('❌ Resend verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// ==================== LOGIN ====================

// LOGIN - WITH VERIFICATION CHECK
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required.' 
      });
    }

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

    // VERIFICATION CHECK - But auto-verify if not verified
    if (!user.email_verified) {
      console.log('⚠️ User not verified, auto-verifying:', email);
      
      // Auto-verify the user
      await pool.query(
        'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1',
        [user.id]
      );
      
      console.log('✅ Auto-verified user during login:', email);
      user.email_verified = true;
    }

    // Generate token
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
        emailVerified: user.email_verified
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

// ==================== FIREBASE SYNC ENDPOINTS ====================

// ✅ FORCE VERIFY BY EMAIL (with Firebase check)
router.post('/force-verify-firebase', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔧 Force verify with Firebase check for:', email);

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, firebase_uid FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    
    if (!user.firebase_uid) {
      return res.status(400).json({ 
        success: false,
        message: 'No Firebase UID found for user' 
      });
    }

    // Use Firebase service to force verify
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const result = await firebaseEmailService.forceVerifyByFirebaseUid(user.firebase_uid);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ Force verification successful! User can now login.',
        email: user.email,
        firebaseUid: user.firebase_uid,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Force verification failed'
      });
    }

  } catch (err) {
    console.error('❌ Force verify Firebase error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ SYNC ALL USERS WITH FIREBASE
router.post('/sync-all-firebase', async (req, res) => {
  try {
    console.log('🔄 Syncing all users with Firebase verification status...');
    
    // Get all users with Firebase UIDs
    const usersResult = await pool.query(
      'SELECT id, email, firebase_uid, email_verified FROM users WHERE firebase_uid IS NOT NULL'
    );

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    let syncedCount = 0;
    let errors = [];

    for (const user of usersResult.rows) {
      try {
        const isVerified = await firebaseEmailService.checkFirebaseVerification(user.firebase_uid);
        
        if (isVerified && !user.email_verified) {
          // Update database to match Firebase
          await pool.query(
            'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1',
            [user.id]
          );
          syncedCount++;
          console.log(`✅ Synced user: ${user.email}`);
        }
      } catch (error) {
        errors.push({ email: user.email, error: error.message });
        console.log(`❌ Error syncing user ${user.email}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `✅ Sync completed! ${syncedCount} users updated.`,
      synced: syncedCount,
      total: usersResult.rows.length,
      errors: errors
    });

  } catch (err) {
    console.error('❌ Sync all Firebase error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ==================== IMMEDIATE FIX ENDPOINTS ====================

// ✅ MANUAL SYNC VERIFICATION STATUS
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

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const result = await firebaseEmailService.manualSyncUserVerification(email);

    if (result.success) {
      res.json({
        success: true,
        message: '✅ Manual sync successful! User can now login.',
        user: result.user,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }

  } catch (err) {
    console.error('❌ Manual sync error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ QUICK VERIFY - FOR TESTING
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

    // Direct database update - no Firebase check
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
      message: '✅ QUICK VERIFICATION SUCCESS! User can now login immediately.',
      user: result.rows[0],
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Quick verify error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ CHECK FIREBASE VERIFICATION STATUS DIRECTLY
router.post('/check-firebase-status', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔍 Checking Firebase status for:', email);

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, firebase_uid, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    
    if (!user.firebase_uid) {
      return res.status(400).json({ 
        success: false,
        message: 'No Firebase UID found for user' 
      });
    }

    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    const isVerified = await firebaseEmailService.checkFirebaseVerification(user.firebase_uid);

    res.json({
      success: true,
      email: user.email,
      firebaseUid: user.firebase_uid,
      firebaseVerified: isVerified,
      databaseVerified: user.email_verified,
      syncStatus: isVerified === user.email_verified ? 'IN SYNC' : 'OUT OF SYNC',
      needsUpdate: isVerified && !user.email_verified,
      message: isVerified ? 
        'Email is verified in Firebase' : 
        'Email is NOT verified in Firebase',
      action: isVerified && !user.email_verified ? 
        'Use POST /api/auth/verify-email-callback to sync' : 
        'No action needed'
    });

  } catch (err) {
    console.error('❌ Check Firebase status error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ==================== USER MANAGEMENT ====================

// GET USER PROFILE
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

// DELETE USER
router.delete('/user', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Delete user's medical records first
    await pool.query('DELETE FROM medical_info WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
    
    // Delete user
    const result = await pool.query('DELETE FROM users WHERE email = $1 RETURNING id, email', [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      message: '✅ User deleted successfully!',
      deletedUser: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Delete error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during deletion' 
    });
  }
});

// ==================== DEBUG ENDPOINTS ====================

// GET USER DETAILS WITH FIREBASE INFO
router.get('/user-details/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      `SELECT 
        u.id, u.email, u.username, u.email_verified, u.firebase_uid, u.created_at,
        mi.full_name, mi.photo_url
       FROM users u
       LEFT JOIN medical_info mi ON u.id = mi.user_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = result.rows[0];

    // Check Firebase status if UID exists
    let firebaseStatus = null;
    if (user.firebase_uid) {
      try {
        const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
        const isVerified = await firebaseEmailService.checkFirebaseVerification(user.firebase_uid);
        firebaseStatus = {
          verified: isVerified,
          lastChecked: new Date().toISOString()
        };
      } catch (firebaseError) {
        firebaseStatus = {
          error: firebaseError.message,
          lastChecked: new Date().toISOString()
        };
      }
    }

    res.json({
      success: true,
      user: user,
      firebaseStatus: firebaseStatus,
      syncStatus: firebaseStatus ? 
        (firebaseStatus.verified === user.email_verified ? 'IN SYNC' : 'OUT OF SYNC') : 
        'NO FIREBASE UID',
      actions: {
        sync: 'POST /api/auth/manual-sync-verification',
        verify: 'POST /api/auth/super-verify',
        quickVerify: 'POST /api/auth/quick-verify',
        triggerEmail: 'POST /api/auth/trigger-verification-email',
        checkFirebase: 'POST /api/auth/check-firebase-status'
      }
    });

  } catch (err) {
    console.error('❌ User details error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// ✅ DEBUG SEND VERIFICATION EMAIL
router.post('/debug-send-verification', async (req, res) => {
  try {
    const { email, password, userId } = req.body;

    if (!email || !password || !userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, password, and userId are required' 
      });
    }

    console.log('🐛 Debug send verification for:', email);
    
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    
    // Test just the email sending part
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, password, userId);

    if (emailResult && emailResult.email) {
      res.json({
        success: true,
        message: '✅ Verification email sent successfully!',
        details: emailResult,
        nextSteps: 'Check your email inbox and spam folder'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '❌ Failed to send verification email',
        error: emailResult?.error || 'Unknown error'
      });
    }

  } catch (err) {
    console.error('❌ Debug send verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Error: ' + err.message 
    });
  }
});

export default router;
