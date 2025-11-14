import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password } = req.body;

    if (!full_name || !email || !username || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // ✅ Allow duplicate emails & usernames
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, username, password, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING id, full_name, email, username, created_at`,
      [full_name, email, username, hashedPassword]
    );

    res.json({
      message: '✅ User registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// LOGIN (email + password)
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
      return res.status(401).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ CHECK IF USER HAS MEDICAL INFO
    const medicalResult = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [user.id]
    );

    const hasMedicalInfo = medicalResult.rows.length > 0;

    // ✅ Include user.id in token payload
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '1h' }
    );

    // ✅ Return both token and user info WITH medical status
    res.json({
      message: '✅ Login successful',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        username: user.username
      },
      hasMedicalInfo: hasMedicalInfo  // ✅ NEW: Tell frontend if user has medical data
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

export default router;
