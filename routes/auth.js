// routes/auth.js - COMPLETE WORKING VERSION WITH EMAIL + INSTANT VERIFICATION
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import emailVerificationService from '../services/email-verification-service.js';

const router = express.Router();

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
          : 'Use POST /api/auth/super-verify to verify instantly'
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

// REGISTER - WITH EMAIL VERIFICATION OPTION
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password, skipEmail = false } = req.body;

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

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (full_name, email, username, password, email_verified, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) 
       RETURNING id, full_name, email, username, email_verified, created_at`,
      [full_name, email, username, hashedPassword, false] // Start as not verified
    );

    const newUser = result.rows[0];

    let emailResult = { success: false, message: 'Email not sent' };

    // Send verification email unless skipped
    if (!skipEmail) {
      try {
        const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
        emailResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);
        
        if (emailResult.success) {
          console.log('✅ Verification email sent to:', email);
        } else {
          console.log('⚠️ Email sending failed:', emailResult.error);
        }
      } catch (emailError) {
        console.log('⚠️ Email service error:', emailError.message);
        emailResult = { success: false, error: emailError.message };
      }
    }

    // Auto-verify if email sending was skipped or failed
    let autoVerified = false;
    if (skipEmail || !emailResult.success) {
      const verifyResult = await emailVerificationService.verifyEmailInstantly(email);
      autoVerified = verifyResult.success;
      if (autoVerified) {
        newUser.email_verified = true;
        console.log('✅ Auto-verified user:', email);
      }
    }

    const response = {
      success: true,
      message: '✅ Registration successful!',
      user: newUser
    };

    if (emailResult.success) {
      response.emailStatus = 'Verification email sent - check your inbox';
      response.verificationInstruction = 'Click the link in the email OR use POST /api/auth/super-verify';
    } else if (autoVerified) {
      response.emailStatus = 'Auto-verified - ready to login!';
      response.instruction = 'You can login immediately';
    } else {
      response.emailStatus = 'Email failed - verify manually';
      response.verificationInstruction = 'Use POST /api/auth/super-verify with: { "email": "' + email + '" }';
    }

    response.testEndpoints = {
      verify: 'POST /api/auth/super-verify',
      checkStatus: 'GET /api/auth/verification-status/' + email,
      login: 'POST /api/auth/login'
    };

    res.status(201).json(response);

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
          message: '✅ Verification email sent successfully. Please check your inbox and spam folder.' 
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Failed to send verification email. Please try again or use instant verification.',
          instantVerify: 'POST /api/auth/super-verify with { "email": "' + email + '" }'
        });
      }
    } catch (emailError) {
      console.log('⚠️ Email service error:', emailError.message);
      res.status(500).json({ 
        success: false,
        message: 'Email service unavailable. Use instant verification instead.',
        instantVerify: 'POST /api/auth/super-verify with { "email": "' + email + '" }'
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

    // VERIFICATION CHECK
    if (!user.email_verified) {
      return res.status(403).json({ 
        success: false,
        message: 'Email not verified.',
        email: user.email,
        solutions: [
          'Check your email for verification link',
          'Use POST /api/auth/resend-verification to resend email',
          'Use POST /api/auth/super-verify for instant verification',
          'Use POST /api/auth/force-verify-firebase to sync with Firebase'
        ],
        instantVerify: 'POST /api/auth/super-verify with: { "email": "' + user.email + '" }'
      });
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

export default router;
