// routes/auth.js - SIMPLE WORKING VERSION
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import emailVerificationService from '../services/email-verification-service.js';

const router = express.Router();

// ==================== INSTANT VERIFICATION ENDPOINTS ====================

// ✅ SUPER VERIFY - THIS WILL DEFINITELY WORK
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

    // Use the new service that directly updates the database
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

// ==================== AUTH ENDPOINTS ====================

// REGISTER - SIMPLE VERSION
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

    res.status(201).json({
      success: true,
      message: '✅ Registration successful! Use /api/auth/super-verify to verify instantly.',
      user: newUser,
      verificationInstruction: 'POST /api/auth/super-verify with: { "email": "' + email + '" }',
      testLogin: 'After verification, login with POST /api/auth/login'
    });

  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration: ' + err.message 
    });
  }
});

// LOGIN - SIMPLE VERIFICATION CHECK
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

    // SIMPLE VERIFICATION CHECK
    if (!user.email_verified) {
      return res.status(403).json({ 
        success: false,
        message: 'Email not verified. Use POST /api/auth/super-verify to verify instantly.',
        email: user.email,
        fixInstruction: 'POST /api/auth/super-verify with: { "email": "' + user.email + '" }'
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
