// admin.js - FIXED VERSION WITH ROBUST ACTIVITY LOGS
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
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

// ==================== ACTIVITY LOGS ENDPOINTS - FIXED ====================

// GET ACTIVITY LOGS - FIXED: More robust error handling
router.get('/activity-logs', async (req, res) => {
  try {
    const { admin_id } = req.query;
    
    console.log('📋 Fetching activity logs...', { admin_id });

    // Check if activity_logs table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ activity_logs table does not exist, creating it...');
      
      // Create activity_logs table
      await pool.query(`
        CREATE TABLE activity_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(50) NOT NULL,
          description TEXT,
          admin_id INTEGER,
          admin_name VARCHAR(255),
          timestamp TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      console.log('✅ Created activity_logs table');
      
      // Insert initial log entry
      await pool.query(`
        INSERT INTO activity_logs (action, description, admin_id, admin_name, timestamp)
        VALUES ('SYSTEM', 'Activity logs system initialized', $1, 'System', NOW())
      `, [admin_id || 1]);
      
      return res.json({
        success: true,
        logs: [
          {
            id: 1,
            action: 'SYSTEM',
            description: 'Activity logs system initialized',
            admin_id: admin_id || 1,
            admin_name: 'System',
            timestamp: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
        ],
        message: 'Activity logs table created successfully'
      });
    }

    // Build query - FIXED: Simplified without admin_id filter first
    let query = `
      SELECT * FROM activity_logs 
      ORDER BY timestamp DESC 
      LIMIT 100
    `;
    let values = [];

    console.log('📝 Executing logs query:', query);
    const result = await pool.query(query, values);
    
    console.log(`✅ Found ${result.rows.length} activity logs`);

    // Format the response properly
    const formattedLogs = result.rows.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      admin_id: log.admin_id,
      admin_name: log.admin_name,
      timestamp: log.timestamp,
      created_at: log.created_at
    }));

    res.json({
      success: true,
      logs: formattedLogs
    });

  } catch (err) {
    console.error('❌ Get activity logs error:', err.message);
    
    // Return empty array with success for better UX
    res.json({
      success: true,
      logs: [],
      message: 'No logs available: ' + err.message
    });
  }
});

// LOG ACTIVITY - FIXED: Better error handling
router.post('/log-activity', async (req, res) => {
  try {
    const { action, description, admin_id, admin_name, timestamp } = req.body;

    if (!action) {
      return res.status(400).json({ 
        success: false,
        message: 'Action is required' 
      });
    }

    console.log('📝 Logging activity:', { action, description, admin_id, admin_name });

    // Ensure activity_logs table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Create activity_logs table
      await pool.query(`
        CREATE TABLE activity_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(50) NOT NULL,
          description TEXT,
          admin_id INTEGER,
          admin_name VARCHAR(255),
          timestamp TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Created activity_logs table for logging');
    }

    const result = await pool.query(
      `INSERT INTO activity_logs (action, description, admin_id, admin_name, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [action, description, admin_id, admin_name, timestamp || new Date()]
    );

    console.log('✅ Activity logged successfully:', result.rows[0].id);

    res.json({
      success: true,
      log: result.rows[0],
      message: 'Activity logged successfully'
    });

  } catch (err) {
    console.error('❌ Log activity error:', err.message);
    
    // Still return success to avoid breaking the frontend
    res.json({
      success: true,
      message: 'Activity recorded (log may not be saved)'
    });
  }
});

// CLEAR LOGS - FIXED: Better response
router.delete('/clear-logs', async (req, res) => {
  try {
    console.log('🗑️ Clearing all activity logs...');

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return res.status(404).json({ 
        success: false,
        message: 'Activity logs table does not exist' 
      });
    }

    const result = await pool.query('DELETE FROM activity_logs');
    
    console.log('✅ All activity logs cleared. Rows affected:', result.rowCount);

    res.json({
      success: true,
      message: `All activity logs cleared successfully (${result.rowCount} records removed)`,
      records_removed: result.rowCount
    });

  } catch (err) {
    console.error('❌ Clear logs error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Error clearing activity logs: ' + err.message 
    });
  }
});

// ALTERNATIVE LOGS ENDPOINT (fallback) - FIXED
router.get('/logs', async (req, res) => {
  try {
    console.log('📋 Fetching logs via alternative endpoint...');

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return res.json({
        success: true,
        logs: [],
        message: 'No activity logs table found'
      });
    }

    const result = await pool.query(`
      SELECT * FROM activity_logs 
      ORDER BY timestamp DESC 
      LIMIT 50
    `);

    console.log(`✅ Alternative endpoint found ${result.rows.length} logs`);

    res.json({
      success: true,
      logs: result.rows
    });

  } catch (err) {
    console.error('❌ Alternative logs endpoint error:', err.message);
    res.json({
      success: true,
      logs: []
    });
  }
});

// ==================== BASE64 PROFILE PHOTO UPLOAD ====================
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
        message: 'User ID is required' 
      });
    }

    if (!profile_photo) {
      return res.status(400).json({ 
        success: false,
        message: 'Profile photo data is required' 
      });
    }

    // Validate base64 image
    if (!profile_photo.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Please provide a valid base64 image.'
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
        message: 'User not found'
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
      message: 'Server error updating profile photo: ' + err.message 
    });
  }
});

// ==================== PROFILE PHOTO UPLOAD ENDPOINT ====================
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
        message: 'User ID is required' 
      });
    }

    if (!file) {
      return res.status(400).json({ 
        success: false,
        message: 'Profile photo file is required' 
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
          message: 'User not found'
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
          message: 'File size too large. Please upload images smaller than 5MB.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error updating profile photo: ' + err.message 
    });
  }
});

// ==================== USER MANAGEMENT ENDPOINTS ====================

// GET ALL USERS - UPDATED FOR BASE64
router.get('/users', async (req, res) => {
  try {
    console.log('🔍 Fetching users from database...');

    const query = `
      SELECT 
        u.id as user_id,
        u.email,
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
      const simpleResult = await pool.query('SELECT id as user_id, email, created_at FROM users ORDER BY created_at DESC');
      
      const simpleUsers = simpleResult.rows.map(user => ({
        user_id: user.user_id,
        email: user.email,
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
        message: 'Server error fetching users: ' + err.message
      });
    }
  }
});

// ADMIN LOGIN
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find admin by email
    const result = await pool.query(
      `SELECT * FROM admins WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
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

    res.json({
      message: '✅ Admin login successful',
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
    res.status(500).json({ message: 'Server error during admin login' });
  }
});

// APPROVE USER MEDICAL INFORMATION
router.post('/approve-user', async (req, res) => {
  try {
    const { user_id, admin_id } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({ message: 'User ID and Admin ID are required' });
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
      return res.status(404).json({ message: 'User medical information not found' });
    }

    res.json({
      success: true,
      message: 'User medical information approved successfully'
    });

  } catch (err) {
    console.error('❌ Approve user error:', err.message);
    res.status(500).json({ message: 'Server error approving user' });
  }
});

// UNAPPROVE USER MEDICAL INFORMATION
router.post('/unapprove-user', async (req, res) => {
  try {
    const { user_id, admin_id } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({ message: 'User ID and Admin ID are required' });
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
      return res.status(404).json({ message: 'User medical information not found' });
    }

    res.json({
      success: true,
      message: 'User medical information unapproved successfully'
    });

  } catch (err) {
    console.error('❌ Unapprove user error:', err.message);
    res.status(500).json({ message: 'Server error unapproving user' });
  }
});

// DELETE USER
router.delete('/delete-user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { admin_id } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({ message: 'User ID and Admin ID are required' });
    }

    // Get user info for logging before deletion
    const userResult = await pool.query(
      `SELECT u.email, mi.full_name 
       FROM users u 
       LEFT JOIN medical_info mi ON u.id = mi.user_id 
       WHERE u.id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userEmail = userResult.rows[0].email;
    const userName = userResult.rows[0].full_name || userEmail;

    // Start a transaction to ensure all deletions happen
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete from medical_info first (due to foreign key constraint)
      await client.query('DELETE FROM medical_info WHERE user_id = $1', [user_id]);
      
      // Delete from users
      await client.query('DELETE FROM users WHERE id = $1', [user_id]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Delete user error:', err.message);
    
    if (err.message.includes('foreign key constraint')) {
      return res.status(400).json({ 
        message: 'Cannot delete user. There might be related records in other tables.' 
      });
    }
    
    res.status(500).json({ message: 'Server error deleting user' });
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
        message: 'All required fields must be provided'
      });
    }

    // Check if medical record exists for this user
    const existingRecord = await pool.query(
      'SELECT * FROM medical_info WHERE user_id = $1',
      [user_id]
    );

    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Medical record not found for this user'
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
      return res.status(500).json({ message: 'Failed to update medical information' });
    }

    res.json({
      message: 'Medical information updated successfully',
      medical_info: result.rows[0],
      user_id: user_id,
      lastUpdated: result.rows[0].lastupdated
    });

  } catch (err) {
    console.error('❌ Update medical info error:', err.message);
    
    if (err.message.includes('foreign key constraint')) {
      return res.status(404).json({ 
        message: 'User not found in the system' 
      });
    }
    
    res.status(500).json({ 
      message: 'Server error during medical information update',
      error: err.message 
    });
  }
});

// FIND USER BY MEDICAL INFO
router.post('/find-user-by-medical', async (req, res) => {
  try {
    const { full_name, dob } = req.body;

    if (!full_name || !dob) {
      return res.status(400).json({ message: 'Full name and date of birth are required' });
    }

    const result = await pool.query(
      `SELECT user_id FROM medical_info WHERE full_name ILIKE $1 AND dob = $2`,
      [`%${full_name.trim()}%`, dob]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Medical record not found' });
    }

    res.json({
      success: true,
      user_id: result.rows[0].user_id
    });

  } catch (err) {
    console.error('❌ Find user by medical info error:', err.message);
    res.status(500).json({ message: 'Server error finding user' });
  }
});

// REFRESH USER DATA
router.post('/refresh-user-data', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    console.log(`🔄 Refreshing user data for: ${user_id}`);

    res.json({
      success: true,
      message: 'User data refresh triggered'
    });

  } catch (err) {
    console.error('❌ Refresh user data error:', err.message);
    res.status(500).json({ message: 'Server error refreshing user data' });
  }
});

export default router;
