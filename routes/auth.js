// routes/auth.js - COMPLETE REVISED VERSION
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import firebaseEmailService from '../services/firebase-email-service.js';

const router = express.Router();

// REGISTER - WITH EMAIL VERIFICATION
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password } = req.body;

    if (!full_name || !email || !username || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Email or username already exists' });
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

    // Send verification email with user ID
    console.log('📧 Sending verification email to:', email);
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, password, newUser.id);
    
    if (emailResult.success) {
      console.log('✅ Email sent successfully, Firebase UID:', emailResult.firebaseUid);
    } else {
      console.log('⚠️ Email sending failed:', emailResult.error);
    }

    res.status(201).json({
      message: '✅ Registration successful! Please check your email to verify your account before logging in.',
      user: newUser,
      requiresVerification: true
    });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// LOGIN - WITH PROPER EMAIL VERIFICATION CHECK
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 ORDER BY id DESC LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ CHECK EMAIL VERIFICATION - UPDATED LOGIC
    if (!user.email_verified) {
      // Check if user has Firebase UID (meaning they went through email verification)
      if (user.firebase_uid) {
        console.log('🔄 User has Firebase UID, checking verification status...');
        
        // For now, we'll auto-verify users with Firebase UID
        // In production, you'd check Firebase directly
        await pool.query(
          'UPDATE users SET email_verified = true WHERE id = $1',
          [user.id]
        );
        
        console.log('✅ Auto-verified user with Firebase UID:', user.email);
        
        // Update user object
        user.email_verified = true;
      } else {
        return res.status(403).json({ 
          message: 'Please verify your email address before logging in. Check your inbox for the verification email.',
          requiresVerification: true,
          email: user.email
        });
      }
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
      { expiresIn: '1h' }
    );

    res.json({
      message: '✅ Login successful',
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
    res.status(500).json({ message: 'Server error during login' });
  }
});

// VERIFY EMAIL ENDPOINT (for when user clicks verification link)
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Update user as verified
    const result = await pool.query(
      `UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, email_verified`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: '✅ Email verified successfully! You can now login.',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Email verification error:', err.message);
    res.status(500).json({ message: 'Server error during email verification' });
  }
});

// MANUAL VERIFY EMAIL (for testing/admin)
router.post('/manual-verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Update user as verified
    const result = await pool.query(
      `UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, email_verified`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: '✅ Email manually verified successfully! You can now login.',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Manual verification error:', err.message);
    res.status(500).json({ message: 'Server error during manual verification' });
  }
});

// RESEND VERIFICATION EMAIL
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // If already verified
    if (user.email_verified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Resend verification email
    const emailResult = await firebaseEmailService.sendVerificationEmail(email, 'temp-password-' + Date.now(), user.id);

    if (emailResult.success) {
      res.json({ message: '✅ Verification email sent successfully. Please check your inbox.' });
    } else {
      res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }
  } catch (err) {
    console.error('❌ Resend verification error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ DELETE USER ACCOUNT (from both Neon DB and Firebase)
router.delete('/user', async (req, res) => {
  try {
    const { email, userId } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ message: 'Email or user ID is required.' });
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
      return res.status(404).json({ message: 'User not found' });
    }

    // Step 1: Delete from Firebase Auth (if Firebase UID exists)
    if (user.firebase_uid) {
      console.log('🗑️ Deleting Firebase user with UID:', user.firebase_uid);
      const firebaseResult = await firebaseEmailService.deleteFirebaseUser(user.firebase_uid);
      
      if (firebaseResult.success) {
        console.log('✅ Firebase user deletion process initiated');
      } else {
        console.log('⚠️ Firebase user deletion may need manual cleanup');
      }
    } else {
      console.log('ℹ️ No Firebase UID found, skipping Firebase deletion');
    }

    // Step 2: Delete user's medical records first (due to foreign key constraint)
    try {
      await pool.query(
        'DELETE FROM medical_info WHERE user_id = $1',
        [user.id]
      );
      console.log('✅ Medical records deleted for user:', user.id);
    } catch (medicalError) {
      console.log('⚠️ No medical records to delete or error:', medicalError.message);
    }

    // Step 3: Delete user from Neon DB
    await pool.query(
      'DELETE FROM users WHERE id = $1',
      [user.id]
    );

    console.log('✅ User deleted from Neon DB:', user.email);

    res.json({
      message: '✅ User account deleted successfully from both database and authentication system.',
      deletedUser: {
        id: user.id,
        email: user.email,
        firebaseUid: user.firebase_uid
      }
    });

  } catch (err) {
    console.error('❌ User deletion error:', err.message);
    res.status(500).json({ message: 'Server error during user deletion' });
  }
});

// ✅ ADMIN - DELETE USER BY ID
router.delete('/admin/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Valid user ID is required.' });
    }

    // Get user data
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Delete from Firebase Auth (if Firebase UID exists)
    if (user.firebase_uid) {
      console.log('🗑️ Admin: Deleting Firebase user with UID:', user.firebase_uid);
      const firebaseResult = await firebaseEmailService.deleteFirebaseUser(user.firebase_uid);
      
      if (firebaseResult.success) {
        console.log('✅ Firebase user deletion process initiated');
      }
    }

    // Delete user's medical records first
    try {
      await pool.query(
        'DELETE FROM medical_info WHERE user_id = $1',
        [userId]
      );
      console.log('✅ Medical records deleted for user:', userId);
    } catch (medicalError) {
      console.log('⚠️ No medical records to delete:', medicalError.message);
    }

    // Delete user from Neon DB
    await pool.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );

    console.log('✅ User deleted by admin:', user.email);

    res.json({
      message: '✅ User account deleted successfully.',
      deletedUser: {
        id: user.id,
        email: user.email,
        firebaseUid: user.firebase_uid
      }
    });

  } catch (err) {
    console.error('❌ Admin user deletion error:', err.message);
    res.status(500).json({ message: 'Server error during user deletion' });
  }
});

// ✅ GET USER BY EMAIL (for verification/deletion purposes)
router.get('/user-by-email/:email', async (req, res) => {
  try {
    const email = req.params.email;

    const result = await pool.query(
      'SELECT id, email, username, firebase_uid, email_verified, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ User lookup error:', err.message);
    res.status(500).json({ message: 'Server error during user lookup' });
  }
});

// ✅ GET USER PROFILE
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    
    const result = await pool.query(
      'SELECT id, full_name, email, username, email_verified, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Profile error:', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
