// admin.js - FIXED ADMIN LOGIN
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import firebaseEmailService from '../services/firebase-email-service.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';

const router = express.Router();

// ==================== FILE UPLOAD CONFIGURATION ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory:', uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = file.originalname.split('.').pop();
    const filename = 'profile-' + uniqueSuffix + '.' + fileExtension;
    console.log('📁 Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
  }
});

// ==================== ADMIN AUTHENTICATION - FIXED ====================

// ADMIN LOGIN - FIXED: Using your original logic
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Admin login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required.' 
      });
    }

    // Find admin by email - using your existing admins table
    const result = await pool.query(
      `SELECT * FROM admins WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ Admin not found:', email);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid admin credentials' 
      });
    }

    const admin = result.rows[0];
    console.log('✅ Admin found:', admin.email);

    // Verify password
    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      console.log('❌ Invalid password for admin:', email);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid admin credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        adminId: admin.id, 
        email: admin.email, 
        role: admin.role 
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '24h' }
    );

    console.log('✅ Admin login successful:', admin.email);

    res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (err) {
    console.error('❌ Admin login error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error during admin login' 
    });
  }
});

// ==================== USER MANAGEMENT ====================

// GET ALL USERS
router.get('/users', async (req, res) => {
  try {
    console.log('🔍 Fetching users from database...');

    const query = `
      SELECT 
        u.id as user_id,
        u.email,
        u.username,
        u.email_verified,
        u.firebase_uid,
        u.created_at,
        mi.photo_url as profile_photo,
        COALESCE(mi.full_name, 'Not provided') as full_name,
        mi.dob,
        COALESCE(mi.blood_type, 'Not provided') as blood_type,
        COALESCE(mi.address, 'Not provided') as address,
        COALESCE(mi.allergies, 'None') as allergies,
        COALESCE(mi.medications, 'None') as medications,
        COALESCE(mi.conditions, 'None') as conditions,
        COALESCE(mi.emergency_contact, 'Not provided') as emergency_contact,
        mi.updated_at as lastUpdated,
        COALESCE(mi.approved, false) as approved,
        mi.approved_at,
        mi.approved_by
      FROM users u
      LEFT JOIN medical_info mi ON u.id = mi.user_id
      ORDER BY u.created_at DESC
    `;

    console.log('📝 Executing query:', query);
    const result = await pool.query(query);
    console.log(`✅ Found ${result.rows.length} users`);

    // Process the results - support both base64 and file paths
    const usersWithPhotos = result.rows.map(user => {
      let profile_photo = user.profile_photo;
      
      // If it's a file path, convert to full URL
      if (profile_photo && !profile_photo.startsWith('data:image/') && !profile_photo.startsWith('http')) {
        if (profile_photo.startsWith('/uploads/')) {
          profile_photo = profile_photo;
        } else if (profile_photo.startsWith('uploads/')) {
          profile_photo = `/${profile_photo}`;
        } else {
          profile_photo = `/uploads/${profile_photo}`;
        }
      }

      return {
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        email_verified: user.email_verified,
        firebase_uid: user.firebase_uid,
        created_at: user.created_at,
        profile_photo: profile_photo || '',
        full_name: user.full_name || 'Not provided',
        dob: user.dob || null,
        blood_type: user.blood_type || 'Not provided',
        address: user.address || 'Not provided',
        allergies: user.allergies || 'None',
        medications: user.medications || 'None',
        conditions: user.conditions || 'None',
        emergency_contact: user.emergency_contact || 'Not provided',
        lastUpdated: user.lastupdated || user.updated_at || user.created_at,
        approved: user.approved || false,
        approved_at: user.approved_at || null,
        approved_by: user.approved_by || null
      };
    });

    res.json({
      success: true,
      users: usersWithPhotos
    });

  } catch (err) {
    console.error('❌ Get users error:', err.message);
    
    // Fallback to simple user query
    try {
      const simpleResult = await pool.query('SELECT id as user_id, email, username, email_verified, firebase_uid, created_at FROM users ORDER BY created_at DESC');
      
      const simpleUsers = simpleResult.rows.map(user => ({
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        email_verified: user.email_verified,
        firebase_uid: user.firebase_uid,
        created_at: user.created_at,
        profile_photo: '',
        full_name: 'Not available',
        blood_type: 'Not available',
        address: 'Not available',
        allergies: 'None',
        medications: 'None',
        conditions: 'None',
        emergency_contact: 'Not available',
        approved: false
      }));

      res.json({
        success: true,
        users: simpleUsers
      });
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error fetching users: ' + err.message
      });
    }
  }
});

// GET USER STATISTICS
router.get('/stats', async (req, res) => {
  try {
    // Total users
    const totalUsersResult = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].count);

    // Verified users
    const verifiedUsersResult = await pool.query('SELECT COUNT(*) FROM users WHERE email_verified = true');
    const verifiedUsers = parseInt(verifiedUsersResult.rows[0].count);

    // Users with medical info
    const medicalUsersResult = await pool.query('SELECT COUNT(DISTINCT user_id) FROM medical_info');
    const medicalUsers = parseInt(medicalUsersResult.rows[0].count);

    // Recent registrations (last 7 days)
    const recentUsersResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL \'7 days\''
    );
    const recentUsers = parseInt(recentUsersResult.rows[0].count);

    // Users with Firebase UID
    const firebaseUsersResult = await pool.query('SELECT COUNT(*) FROM users WHERE firebase_uid IS NOT NULL');
    const firebaseUsers = parseInt(firebaseUsersResult.rows[0].count);

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        medicalUsers,
        firebaseUsers,
        recentRegistrations: recentUsers,
        verificationRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0
      }
    });

  } catch (err) {
    console.error('❌ Stats error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching statistics' 
    });
  }
});

// GET USER DETAILS
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid user ID is required.' 
      });
    }

    const userResult = await pool.query(
      `SELECT id, full_name, email, username, email_verified, firebase_uid, created_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Get user's medical info
    const medicalResult = await pool.query(
      'SELECT * FROM medical_info WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      user: user,
      medicalInfo: medicalResult.rows[0] || null,
      hasMedicalInfo: medicalResult.rows.length > 0
    });

  } catch (err) {
    console.error('❌ User details error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching user details' 
    });
  }
});

// ✅ ADMIN: DELETE USER COMPLETELY (from both Neon DB and Firebase)
router.delete('/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid user ID is required.' 
      });
    }

    // Get user data
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Delete from Firebase Auth
    if (user.firebase_uid) {
      console.log('🗑️ Admin: Deleting Firebase user:', user.firebase_uid);
      const firebaseResult = await firebaseEmailService.deleteFirebaseUser(user.firebase_uid);
      
      if (firebaseResult.success) {
        console.log('✅ Firebase user deletion completed');
      } else {
        console.log('⚠️ Firebase user deletion may need manual cleanup');
      }
    } else {
      console.log('ℹ️ No Firebase UID found, skipping Firebase deletion');
    }

    // Delete user's medical records
    try {
      await pool.query(
        'DELETE FROM medical_info WHERE user_id = $1',
        [userId]
      );
      console.log('✅ Medical records deleted');
    } catch (medicalError) {
      console.log('⚠️ No medical records to delete:', medicalError.message);
    }

    // Delete user from database
    await pool.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );

    console.log('✅ User completely deleted by admin:', user.email);

    res.json({
      success: true,
      message: 'User account deleted completely from both systems.',
      deletedUser: {
        id: user.id,
        email: user.email,
        username: user.username,
        firebase_uid: user.firebase_uid
      }
    });

  } catch (err) {
    console.error('❌ Admin user deletion error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error during user deletion' 
    });
  }
});

// MANUALLY VERIFY USER EMAIL
router.post('/verify-user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid user ID is required.' 
      });
    }

    const result = await pool.query(
      `UPDATE users SET email_verified = true WHERE id = $1 
       RETURNING id, email, email_verified`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      message: 'User email manually verified.',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Manual verification error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error during manual verification' 
    });
  }
});

// ==================== MEDICAL RECORDS MANAGEMENT ====================

// GET ALL MEDICAL RECORDS
router.get('/medical-records', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mi.*, u.full_name, u.email, u.username 
       FROM medical_info mi 
       JOIN users u ON mi.user_id = u.id 
       ORDER BY mi.updated_at DESC`
    );

    res.json({
      success: true,
      medicalRecords: result.rows,
      total: result.rows.length
    });

  } catch (err) {
    console.error('❌ Medical records error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching medical records' 
    });
  }
});

// APPROVE USER MEDICAL INFORMATION
router.post('/approve-user', async (req, res) => {
  try {
    const { user_id, admin_id } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID and Admin ID are required' 
      });
    }

    // Get admin name for logging
    const adminResult = await pool.query(
      'SELECT full_name FROM admins WHERE id = $1',
      [admin_id]
    );

    const adminName = adminResult.rows[0]?.full_name || 'Administrator';

    // Update medical_info with approval
    const result = await pool.query(
      `UPDATE medical_info 
       SET approved = true, approved_at = NOW(), approved_by = $1
       WHERE user_id = $2
       RETURNING *`,
      [adminName, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User medical information not found' 
      });
    }

    res.json({
      success: true,
      message: 'User medical information approved successfully'
    });

  } catch (err) {
    console.error('❌ Approve user error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error approving user' 
    });
  }
});

// UNAPPROVE USER MEDICAL INFORMATION
router.post('/unapprove-user', async (req, res) => {
  try {
    const { user_id, admin_id } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID and Admin ID are required' 
      });
    }

    // Update medical_info to remove approval
    const result = await pool.query(
      `UPDATE medical_info 
       SET approved = false, approved_at = NULL, approved_by = NULL
       WHERE user_id = $1
       RETURNING *`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User medical information not found' 
      });
    }

    res.json({
      success: true,
      message: 'User medical information unapproved successfully'
    });

  } catch (err) {
    console.error('❌ Unapprove user error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error unapproving user' 
    });
  }
});

// ==================== ADMIN PROFILE ====================

// ADMIN PROFILE
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    
    res.json({
      success: true,
      admin: {
        id: decoded.adminId,
        email: decoded.email,
        role: decoded.role
      }
    });

  } catch (err) {
    console.error('❌ Admin profile error:', err.message);
    res.status(401).json({ 
      success: false,
      error: 'Invalid token' 
    });
  }
});

// TEST ENDPOINT
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin endpoint is working! 🎉',
    timestamp: new Date().toISOString()
  });
});

export default router;
