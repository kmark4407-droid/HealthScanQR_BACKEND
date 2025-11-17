// admin.js - COMPLETE REVISED VERSION WITH FIREBASE INTEGRATION
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

// ==================== ADMIN AUTHENTICATION ====================

// ADMIN LOGIN
router.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and password are required.' 
      });
    }

    // Hardcoded admin credentials (replace with database check in production)
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid admin credentials' 
      });
    }

    // Generate admin token
    const token = jwt.sign(
      { 
        username: username,
        role: 'admin',
        isAdmin: true 
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'Admin login successful',
      token: token,
      admin: {
        username: username,
        role: 'admin'
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

// UPDATE MEDICAL INFORMATION
router.put('/update-medical/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const {
      full_name,
      dob,
      blood_type,
      address,
      allergies,
      medications,
      conditions,
      emergency_contact,
      admin_id
    } = req.body;

    // Validate required fields
    if (!full_name || !dob || !blood_type || !address || !emergency_contact) {
      return res.status(400).json({ 
        success: false,
        error: 'All required fields must be provided'
      });
    }

    // Check if medical record exists for this user
    const existingRecord = await pool.query(
      'SELECT * FROM medical_info WHERE user_id = $1',
      [user_id]
    );

    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Medical record not found for this user'
      });
    }

    // Update medical information
    const updateQuery = `
      UPDATE medical_info 
      SET 
        full_name = $1,
        dob = $2,
        blood_type = $3,
        address = $4,
        allergies = $5,
        medications = $6,
        conditions = $7,
        emergency_contact = $8,
        updated_at = NOW()
      WHERE user_id = $9
      RETURNING *, updated_at as lastUpdated
    `;

    const updateValues = [
      full_name,
      dob,
      blood_type,
      address,
      allergies || '',
      medications || '',
      conditions || '',
      emergency_contact,
      user_id
    ];

    const result = await pool.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to update medical information' 
      });
    }

    res.json({
      success: true,
      message: 'Medical information updated successfully',
      medical_info: result.rows[0],
      user_id: user_id,
      lastUpdated: result.rows[0].lastupdated
    });

  } catch (err) {
    console.error('❌ Update medical info error:', err.message);
    
    if (err.message.includes('foreign key constraint')) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found in the system' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Server error during medical information update'
    });
  }
});

// ==================== PROFILE PHOTO MANAGEMENT ====================

// BASE64 PROFILE PHOTO UPLOAD
router.post('/change-user-profile-base64', async (req, res) => {
  try {
    const { user_id, profile_photo, filename } = req.body;

    console.log('📸 Base64 profile photo request received:', {
      user_id: user_id,
      hasBase64: !!profile_photo,
      base64Length: profile_photo ? profile_photo.length : 0,
      filename: filename
    });

    if (!user_id) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required' 
      });
    }

    if (!profile_photo) {
      return res.status(400).json({ 
        success: false,
        error: 'Profile photo data is required' 
      });
    }

    // Validate base64 image
    if (!profile_photo.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Please provide a valid base64 image.'
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Store base64 directly in database
    const result = await pool.query(
      `UPDATE medical_info 
       SET photo_url = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [profile_photo, user_id]
    );

    if (result.rows.length === 0) {
      console.log('⚠️ No existing medical_info record, creating one...');
      
      const userEmail = userResult.rows[0]?.email || 'Unknown User';
      
      const insertResult = await pool.query(
        `INSERT INTO medical_info (user_id, photo_url, full_name, updated_at)
         VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [user_id, profile_photo, userEmail]
      );
      
      console.log('✅ Created new medical_info record with base64 photo');
    }

    console.log('✅ Base64 profile photo updated successfully for user:', user_id);

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      new_photo_url: profile_photo
    });

  } catch (err) {
    console.error('❌ Base64 profile photo error:', err.message);
    
    res.status(500).json({ 
      success: false,
      error: 'Server error updating profile photo: ' + err.message 
    });
  }
});

// FILE UPLOAD PROFILE PHOTO
router.post('/change-user-profile', upload.single('profile_photo'), async (req, res) => {
  try {
    const { user_id } = req.body;
    const file = req.file;

    console.log('📸 Change profile photo request received:', {
      user_id: user_id,
      hasFile: !!file,
      fileName: file?.filename
    });

    if (!user_id) {
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required' 
      });
    }

    if (!file) {
      return res.status(400).json({ 
        success: false,
        error: 'Profile photo file is required' 
      });
    }

    // Generate photo URL
    const photoUrl = `/uploads/${file.filename}`;
    
    console.log('💾 Updating database with photo URL:', photoUrl);
    
    // Update medical_info with new photo URL
    const result = await pool.query(
      `UPDATE medical_info 
       SET photo_url = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [photoUrl, user_id]
    );

    if (result.rows.length === 0) {
      console.log('⚠️ No existing medical_info record, creating one...');
      
      const userResult = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [user_id]
      );
      
      if (userResult.rows.length === 0) {
        fs.unlinkSync(file.path);
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      const userEmail = userResult.rows[0]?.email || 'Unknown User';
      
      const insertResult = await pool.query(
        `INSERT INTO medical_info (user_id, photo_url, full_name, updated_at)
         VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [user_id, photoUrl, userEmail]
      );
      
      console.log('✅ Created new medical_info record');
    }

    console.log('✅ Profile photo updated successfully for user:', user_id);

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      new_photo_url: photoUrl
    });

  } catch (err) {
    console.error('❌ Change user profile error:', err.message);
    
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Cleaned up uploaded file due to error');
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError.message);
      }
    }
    
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size too large. Please upload images smaller than 5MB.'
        });
      }
      return res.status(400).json({
        success: false,
        error: `File upload error: ${err.message}`
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Server error updating profile photo: ' + err.message 
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
        username: decoded.username,
        role: decoded.role,
        isAdmin: decoded.isAdmin
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

// ==================== UTILITY ENDPOINTS ====================

// FIND USER BY MEDICAL INFO
router.post('/find-user-by-medical', async (req, res) => {
  try {
    const { full_name, dob } = req.body;

    if (!full_name || !dob) {
      return res.status(400).json({ 
        success: false,
        error: 'Full name and date of birth are required' 
      });
    }

    const result = await pool.query(
      `SELECT user_id FROM medical_info WHERE full_name ILIKE $1 AND dob = $2`,
      [`%${full_name.trim()}%`, dob]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Medical record not found' 
      });
    }

    res.json({
      success: true,
      user_id: result.rows[0].user_id
    });

  } catch (err) {
    console.error('❌ Find user by medical info error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error finding user' 
    });
  }
});

// REFRESH USER DATA
router.post('/refresh-user-data', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required' 
      });
    }

    console.log(`🔄 Refreshing user data for: ${user_id}`);

    res.json({
      success: true,
      message: 'User data refresh triggered'
    });

  } catch (err) {
    console.error('❌ Refresh user data error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error refreshing user data' 
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
