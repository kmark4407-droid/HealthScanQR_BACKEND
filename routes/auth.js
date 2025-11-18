// routes/auth.js - COMPLETE WORKING VERSION WITH VERIFICATION FIX
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// Safe Firebase Admin loader with fallback
const getFirebaseAdmin = async () => {
  try {
    const { deleteFirebaseUser } = await import('../services/firebase-admin-service.js');
    return { deleteFirebaseUser };
  } catch (error) {
    console.log('⚠️ Firebase Admin not available, using fallback');
    return {
      deleteFirebaseUser: async (firebaseUid) => {
        console.log('⚠️ Firebase Admin fallback - would delete:', firebaseUid);
        return { 
          success: false, 
          error: 'Firebase Admin not configured',
          message: 'Firebase account needs manual deletion' 
        };
      }
    };
  }
};

// ==================== VERIFICATION ENDPOINTS ====================

// ✅ FORCE VERIFICATION - INSTANT FIX FOR TESTING
router.post('/force-verify', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔄 Force verifying email:', email);

    // Direct database update - no Firebase check
    const result = await pool.query(
      `UPDATE users SET email_verified = true, updated_at = NOW() 
       WHERE email = $1 
       RETURNING id, email, email_verified`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    console.log('✅ Force verification completed for:', email);

    res.json({
      success: true,
      message: '✅ Email verified successfully! You can now login.',
      user: user
    });

  } catch (err) {
    console.error('❌ Force verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification' 
    });
  }
});

// ✅ CHECK VERIFICATION STATUS
router.post('/check-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    console.log('🔍 Checking verification status for:', email);

    // Get user from database
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

    res.json({
      success: true,
      email: user.email,
      emailVerified: user.email_verified,
      firebaseUid: user.firebase_uid,
      canLogin: user.email_verified,
      message: user.email_verified 
        ? '✅ Email is verified - can login' 
        : '❌ Email not verified - cannot login',
      fixInstruction: 'Use POST /api/auth/force-verify to verify this email'
    });

  } catch (err) {
    console.error('❌ Check verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error checking verification status' 
    });
  }
});

// ✅ GET ALL USERS (for admin debugging)
router.get('/debug-users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, email_verified, firebase_uid, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: result.rows,
      count: result.rows.length
    });

  } catch (err) {
    console.error('❌ Debug users error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching users' 
    });
  }
});

// ==================== AUTH ENDPOINTS ====================

// REGISTER - WITH SIMPLE VERIFICATION
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

    // Insert user with email_verified = false
    const result = await pool.query(
      `INSERT INTO users (full_name, email, username, password, email_verified, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) 
       RETURNING id, full_name, email, username, email_verified, created_at`,
      [full_name, email, username, hashedPassword, false]
    );

    const newUser = result.rows[0];

    // Import the email service dynamically
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');
    
    // Send verification email with user ID
    console.log('📧 Sending verification email to:', email);
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);
    
    if (emailResult.success) {
      console.log('✅ Email sent successfully, Firebase UID:', emailResult.firebaseUid);
      
      res.status(201).json({
        success: true,
        message: '✅ Registration successful! Please check your email for verification. Use /api/auth/force-verify to manually verify for testing.',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.full_name,
          emailVerified: false
        },
        requiresVerification: true,
        verificationSent: true,
        testEndpoint: 'POST /api/auth/force-verify with { "email": "' + email + '" }'
      });
    } else {
      console.log('⚠️ Email sending failed:', emailResult.error);
      
      res.status(201).json({
        success: true,
        message: '✅ Account created but verification email failed. Use /api/auth/force-verify to manually verify.',
        user: newUser,
        requiresVerification: true,
        verificationSent: false,
        testEndpoint: 'POST /api/auth/force-verify with { "email": "' + email + '" }'
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

// LOGIN - WITH SIMPLE VERIFICATION CHECK
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
      `SELECT * FROM users WHERE email = $1 ORDER BY id DESC LIMIT 1`,
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

    // SIMPLE VERIFICATION CHECK - Only check database
    if (!user.email_verified) {
      console.log('❌ Login blocked - email not verified in database for:', email);
      
      return res.status(403).json({ 
        success: false,
        message: 'Please verify your email address before logging in. Use POST /api/auth/force-verify with { "email": "' + email + '" } to verify manually.',
        requiresVerification: true,
        email: user.email,
        testEndpoint: 'POST /api/auth/force-verify'
      });
    }

    // Check if user has medical info
    const medicalResult = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [user.id]
    );

    const hasMedicalInfo = medicalResult.rows.length > 0;

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

    console.log('✅ Login successful for verified user:', email);

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
      },
      hasMedicalInfo: hasMedicalInfo
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

// ==================== VERIFICATION MANAGEMENT ====================

// VERIFY EMAIL ENDPOINT (legacy - for direct verification)
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Update user as verified
    const result = await pool.query(
      `UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, email_verified`,
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
      message: '✅ Email verified successfully! You can now login.',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Email verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during email verification' 
    });
  }
});

// MANUAL VERIFY EMAIL (for testing/admin)
router.post('/manual-verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Update user as verified
    const result = await pool.query(
      `UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, email_verified`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    console.log('✅ Manual verification completed for:', email);

    res.json({
      success: true,
      message: '✅ Email manually verified successfully! You can now login.',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Manual verification error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during manual verification' 
    });
  }
});

// RESEND VERIFICATION EMAIL
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

    // Import the email service dynamically
    const { default: firebaseEmailService } = await import('../services/firebase-email-service.js');

    // Resend verification email
    console.log('📧 Resending verification email to:', email);
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, 'temp-password-' + Date.now(), user.id);

    if (emailResult.success) {
      res.json({ 
        success: true,
        message: '✅ Verification email sent successfully. Please check your inbox and spam folder.' 
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email. Please try again.' 
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

// VERIFICATION STATUS CHECK
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
      message: user.email_verified 
        ? 'Email is verified - can login' 
        : 'Email not verified - cannot login'
    });

  } catch (err) {
    console.error('❌ Verification status error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error checking verification status' 
    });
  }
});

// ==================== USER MANAGEMENT ====================

// ✅ DELETE USER ACCOUNT (from both Neon DB and Firebase)
router.delete('/user', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email, userId } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Email or user ID is required.' 
      });
    }

    let user;

    // Find user by email or ID
    if (email) {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      user = result.rows[0];
    } else {
      const result = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      user = result.rows[0];
    }

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    console.log(`🗑️ Starting deletion process for user: ${user.email} (ID: ${user.id}, Firebase UID: ${user.firebase_uid})`);

    await client.query('BEGIN');

    // Step 1: Delete user's medical records first
    try {
      const medicalDelete = await client.query('DELETE FROM medical_info WHERE user_id = $1', [user.id]);
      console.log(`✅ Medical records deleted for user: ${user.id} (${medicalDelete.rowCount} records)`);
    } catch (medicalError) {
      console.log('⚠️ No medical records to delete or error:', medicalError.message);
    }

    // Step 2: Delete from Firebase Auth
    let firebaseResult = { success: false, error: 'Not attempted' };
    if (user.firebase_uid) {
      console.log('🔥 Attempting Firebase deletion for UID:', user.firebase_uid);
      const firebaseAdmin = await getFirebaseAdmin();
      firebaseResult = await firebaseAdmin.deleteFirebaseUser(user.firebase_uid);
      console.log('🔥 Firebase deletion result:', firebaseResult.success, firebaseResult.message);
    } else {
      console.log('ℹ️ No Firebase UID found, skipping Firebase deletion');
      firebaseResult = { success: true, message: 'No Firebase UID to delete' };
    }

    // Step 3: Delete user from Neon DB
    const userDelete = await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    
    if (userDelete.rowCount === 0) {
      throw new Error('User not found in database during deletion');
    }
    
    console.log('✅ User deleted from Neon DB:', user.email);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: '✅ User account deleted successfully!',
      database_deleted: true,
      firebase_deleted: firebaseResult.success,
      firebase_message: firebaseResult.message,
      deletedUser: {
        id: user.id,
        email: user.email,
        firebaseUid: user.firebase_uid
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ User deletion error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during user deletion: ' + err.message 
    });
  } finally {
    client.release();
  }
});

// ✅ ADMIN - DELETE USER BY ID
router.delete('/admin/user/:userId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid user ID is required.' 
      });
    }

    console.log(`🗑️ Admin deletion request for user ID: ${userId}`);

    // Get user data
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    console.log(`🗑️ Found user to delete: ${user.email} (Firebase UID: ${user.firebase_uid})`);

    await client.query('BEGIN');

    // Delete user's medical records first
    try {
      const medicalDelete = await client.query('DELETE FROM medical_info WHERE user_id = $1', [userId]);
      console.log(`✅ Medical records deleted for user: ${userId} (${medicalDelete.rowCount} records)`);
    } catch (medicalError) {
      console.log('⚠️ No medical records to delete:', medicalError.message);
    }

    // Delete from Firebase Auth
    let firebaseResult = { success: false, error: 'Not attempted' };
    if (user.firebase_uid) {
      console.log('🔥 Admin: Deleting Firebase user:', user.firebase_uid);
      const firebaseAdmin = await getFirebaseAdmin();
      firebaseResult = await firebaseAdmin.deleteFirebaseUser(user.firebase_uid);
      console.log('🔥 Firebase deletion result:', firebaseResult.success, firebaseResult.message);
    } else {
      console.log('ℹ️ No Firebase UID found, skipping Firebase deletion');
      firebaseResult = { success: true, message: 'No Firebase UID to delete' };
    }

    // Delete user from Neon DB
    const userDelete = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    
    if (userDelete.rowCount === 0) {
      throw new Error('User not found in database during deletion');
    }
    
    console.log('✅ User deleted by admin from Neon DB:', user.email);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: '✅ User account deleted successfully!',
      database_deleted: true,
      firebase_deleted: firebaseResult.success,
      firebase_message: firebaseResult.message,
      deletedUser: {
        id: user.id,
        email: user.email,
        firebaseUid: user.firebase_uid
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Admin user deletion error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during user deletion: ' + err.message 
    });
  } finally {
    client.release();
  }
});

// ✅ GET USER BY EMAIL
router.get('/user-by-email/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      'SELECT id, email, username, firebase_uid, email_verified, created_at FROM users WHERE email = $1',
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
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ User lookup error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during user lookup' 
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

// ✅ CHECK USER EXISTS
router.get('/check-user/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      'SELECT id, email, username, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        exists: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      exists: true,
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Check user error:', err.message);
    res.status(500).json({ 
      success: false,
      exists: false,
      message: 'Server error during user check' 
    });
  }
});

// ✅ UPDATE USER PROFILE
router.put('/profile', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { userId, full_name, username } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID is required.' 
      });
    }

    await client.query('BEGIN');

    // Update user profile
    const result = await client.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name), 
           username = COALESCE($2, username),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, full_name, email, username, email_verified, created_at, updated_at`,
      [full_name, username, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: '✅ Profile updated successfully!',
      user: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Profile update error:', err.message);
    
    if (err.message.includes('unique constraint')) {
      return res.status(409).json({ 
        success: false,
        message: 'Username already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during profile update: ' + err.message 
    });
  } finally {
    client.release();
  }
});

// ✅ CHANGE PASSWORD
router.put('/change-password', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID, current password, and new password are required.' 
      });
    }

    await client.query('BEGIN');

    // Get user with current password
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      await client.query('ROLLBACK');
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await client.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, userId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: '✅ Password changed successfully!'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Change password error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during password change: ' + err.message 
    });
  } finally {
    client.release();
  }
});

export default router;
