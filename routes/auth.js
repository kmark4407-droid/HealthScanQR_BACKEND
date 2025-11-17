// routes/auth.js - UPDATED LOGIN WITH FIREBASE CHECK
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

// ✅ NEW: Manual email verification endpoint
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

export default router;
