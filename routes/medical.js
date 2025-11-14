// medical.js - ENHANCED LOGGING VERSION
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

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    console.log('📁 Uploads directory:', uploadsDir);
    
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
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ✅ ENHANCED: Save or update medical info with detailed logging
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('📦 Headers:', req.headers);
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📦 Full request body:', req.body);
    console.log('📸 File details:', req.file);
    
    // Check if user_id exists
    if (!req.body.user_id) {
      console.log('❌ user_id is missing from request body');
      return res.status(400).json({ 
        success: false,
        message: 'User ID is required' 
      });
    }

    // Convert user_id to integer
    const user_id = parseInt(req.body.user_id);
    console.log('🔍 Raw user_id:', req.body.user_id, 'Parsed user_id:', user_id);
    
    if (!user_id || isNaN(user_id)) {
      console.log('❌ Invalid user_id format');
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID format' 
      });
    }

    // Validate required fields
    const requiredFields = ['full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    console.log('📋 Field check - Required:', requiredFields);
    console.log('📋 Field check - Missing:', missingFields);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: ' + missingFields.join(', '),
        missing: missingFields 
      });
    }

    const {
      full_name, dob, blood_type,
      address, allergies = '', medications = '', conditions = '', emergency_contact
    } = req.body;

    console.log('✅ All fields present:', {
      user_id, full_name, dob, blood_type, address, emergency_contact
    });

    // Handle photo URL
    let photo_url = null;
    if (req.file) {
      photo_url = `/uploads/${req.file.filename}`;
      console.log('📷 Photo saved:', photo_url);
    } else {
      console.log('📷 No photo uploaded');
    }

    // Check if user exists in users table
    console.log('🔍 Checking if user exists in database...');
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    console.log('👤 User exists:', userCheck.rows.length > 0 ? 'Yes' : 'No');

    if (userCheck.rows.length === 0) {
      console.log('❌ User not found in database');
      return res.status(404).json({ 
        success: false,
        message: 'User not found. Please register first.' 
      });
    }

    // Check if medical info already exists
    console.log('🔍 Checking existing medical info...');
    const existingQuery = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    console.log('📊 Existing medical records:', existingQuery.rows.length);

    if (existingQuery.rows.length > 0) {
      console.log('🔄 Updating existing medical info');
      
      const updateQuery = `
        UPDATE medical_info 
        SET full_name = $2, dob = $3, blood_type = $4, address = $5, 
            allergies = $6, medications = $7, conditions = $8, 
            emergency_contact = $9, photo_url = COALESCE($10, photo_url), 
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *`;
      
      const updateParams = [
        user_id, full_name, dob, blood_type, address, 
        allergies, medications, conditions, emergency_contact, photo_url
      ];

      console.log('📝 Executing UPDATE query...');
      const updateResult = await pool.query(updateQuery, updateParams);
      
      console.log('✅ Medical info updated successfully');
      return res.json({ 
        success: true,
        message: 'Medical information updated successfully',
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
    
    const insertParams = [
      user_id, full_name, dob, blood_type, address, 
      allergies, medications, conditions, emergency_contact, photo_url
    ];

    console.log('📝 Executing INSERT query...');
    const insertResult = await pool.query(insertQuery, insertParams);

    console.log('✅ Medical info saved successfully');
    res.json({ 
      success: true,
      message: 'Medical information saved successfully', 
      data: insertResult.rows[0] 
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error detail:', err.detail);
    console.error('Error stack:', err.stack);
    
    let userMessage = 'Failed to save medical information';
    
    if (err.code === '23502') { // not-null violation
      userMessage = 'Missing required information';
    } else if (err.code === '23505') { // unique violation
      userMessage = 'Medical information already exists for this user';
    } else if (err.code === '42703') { // undefined column
      userMessage = 'Database configuration error';
    } else if (err.code === '22P02') { // invalid input syntax
      userMessage = 'Invalid data format provided';
    } else if (err.code === '23503') { // foreign key violation
      userMessage = 'User not found. Please register first.';
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage,
      error: err.message
    });
  } finally {
    console.log('=== 🏥 MEDICAL UPDATE REQUEST END ===');
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  console.log('✅ Medical test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Medical endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

export default router;
