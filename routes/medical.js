// medical.js - COMPLETELY REVISED
import express from 'express';
import multer from 'multer';
import pool from '../db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIXED Multer config for production
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    console.log('📁 Uploads directory:', uploadsDir);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Created uploads directory');
    }
    
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    console.log('📸 Generated filename:', uniqueName);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ✅ Save or update medical info with photo - FIXED
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('🔄 Medical update request received');
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📸 File:', req.file ? 'Uploaded' : 'No file');

    // ✅ FIX: Convert user_id to integer and validate
    const user_id = parseInt(req.body.user_id);
    
    if (!user_id || isNaN(user_id)) {
      console.log('❌ Invalid user_id:', req.body.user_id);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID format. Please log in again.' 
      });
    }

    console.log('✅ Converted user_id:', user_id, '(type:', typeof user_id + ')');

    // Validate required fields
    const requiredFields = ['full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields', 
        missing: missingFields 
      });
    }

    const {
      full_name, dob, blood_type,
      address, allergies = '', medications = '', conditions = '', emergency_contact
    } = req.body;

    // Handle photo URL - use absolute URL in production
    let photo_url = null;
    if (req.file) {
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${req.get('host')}`
        : `http://${req.get('host')}`;
      photo_url = `${baseUrl}/uploads/${req.file.filename}`;
    }

    console.log('📋 Processed data for user_id:', user_id);

    // Check if user already has medical info
    console.log('🔍 Checking existing medical info for user_id:', user_id);
    const existingQuery = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    console.log('📊 Existing records found:', existingQuery.rows.length);

    if (existingQuery.rows.length > 0) {
      console.log('🔄 Updating existing medical info');
      const updateQuery = `
        UPDATE medical_info 
        SET full_name = $2, 
            dob = $3, 
            blood_type = $4, 
            address = $5, 
            allergies = $6, 
            medications = $7, 
            conditions = $8, 
            emergency_contact = $9,
            photo_url = COALESCE($10, photo_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *`;
      
      const updateResult = await pool.query(updateQuery, [
        user_id, 
        full_name, 
        dob, 
        blood_type, 
        address, 
        allergies, 
        medications, 
        conditions, 
        emergency_contact, 
        photo_url
      ]);

      console.log('✅ Medical info updated successfully');
      return res.json({ 
        success: true,
        message: '✅ Medical info updated successfully',
        data: updateResult.rows[0]
      });
    }

    // Insert new record
    console.log('🆕 Inserting new medical info');
    const insertQuery = `
      INSERT INTO medical_info 
        (user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`;
    
    const insertResult = await pool.query(insertQuery, [
      user_id, 
      full_name, 
      dob, 
      blood_type, 
      address, 
      allergies, 
      medications, 
      conditions, 
      emergency_contact, 
      photo_url
    ]);

    console.log('✅ Medical info saved successfully');
    res.json({ 
      success: true,
      message: '✅ Medical info saved successfully', 
      data: insertResult.rows[0] 
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error detail:', err.detail);
    console.error('Error stack:', err.stack);
    
    let userMessage = 'Server error while saving medical information';
    
    if (err.code === '23502') {
      userMessage = 'Missing required field: ' + err.detail;
    } else if (err.code === '23505') {
      userMessage = 'Medical info already exists for this user';
    } else if (err.code === '42703') {
      userMessage = 'Database configuration error';
    } else if (err.code === '22P02') {
      userMessage = 'Invalid data format provided';
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    console.log('=== MEDICAL UPDATE REQUEST END ===');
  }
});

// ✅ Fetch medical info - UPDATED
router.get('/:user_id', async (req, res) => {
  try {
    const userId = parseInt(req.params.user_id);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        exists: false,
        message: 'Invalid user ID format'
      });
    }

    console.log('🔍 Fetching medical info for user_id:', userId);

    const result = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [userId]
    );
    
    console.log('📊 Medical query - rows found:', result.rows.length);

    if (result.rows.length === 0) {
      return res.json({
        exists: false,
        message: 'No medical information found'
      });
    }
    
    res.json({
      exists: true,
      data: result.rows[0]
    });
    
  } catch (err) {
    console.error('❌ Fetch medical error:', err);
    res.status(500).json({ 
      exists: false,
      message: 'Error fetching medical info',
      error: err.message 
    });
  }
});

// ✅ Debug route to check user ID types
router.post('/debug-user-id', async (req, res) => {
  try {
    const stringUserId = req.body.user_id;
    const intUserId = parseInt(stringUserId);
    
    console.log('🔍 User ID Debug:');
    console.log('  - String version:', stringUserId, '(type:', typeof stringUserId + ')');
    console.log('  - Integer version:', intUserId, '(type:', typeof intUserId + ')');
    console.log('  - Is valid integer?', !isNaN(intUserId));
    
    // Test if this user exists in users table
    const userCheck = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [intUserId]
    );
    
    res.json({
      stringUserId,
      intUserId,
      isValidInteger: !isNaN(intUserId),
      userExists: userCheck.rows.length > 0,
      userData: userCheck.rows[0] || null
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
