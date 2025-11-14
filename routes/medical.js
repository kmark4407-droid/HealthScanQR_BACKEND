// medical.js - FIXED VERSION WITH BASE64 IMAGE STORAGE
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

// ✅ SIMPLIFIED: Multer config with memory storage (no file system)
const storage = multer.memoryStorage(); // Store file in memory instead of disk

const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit for base64
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ✅ GET medical information by user_id
router.get('/:user_id', async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id);
    
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID' 
      });
    }

    console.log('🔍 Fetching medical info for user:', user_id);

    const result = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      console.log('❌ No medical info found for user:', user_id);
      return res.json({ 
        success: true,
        exists: false,
        message: 'No medical information found for this user'
      });
    }

    const medicalInfo = result.rows[0];
    console.log('✅ Medical info found');

    res.json({
      success: true,
      exists: true,
      ...medicalInfo
    });

  } catch (err) {
    console.error('❌ Get medical info error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching medical information',
      error: err.message
    });
  }
});

// ✅ FIXED: Save or update medical info with BASE64 image storage
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📄 File:', req.file ? `Uploaded: ${req.file.originalname}` : 'No file');

    // Convert user_id to integer
    const user_id = parseInt(req.body.user_id);
    
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID format' 
      });
    }

    // Validate required fields
    const requiredFields = ['full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
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

    // ✅ FIXED: Convert image to base64 for database storage
    let photo_base64 = null;
    if (req.file) {
      try {
        // Convert buffer to base64
        photo_base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        console.log('🖼️ Image converted to base64, size:', photo_base64.length, 'chars');
      } catch (base64Error) {
        console.error('❌ Base64 conversion error:', base64Error);
        return res.status(400).json({
          success: false,
          message: 'Error processing image file'
        });
      }
    }

    // Check if medical info already exists
    const existingQuery = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    let result;
    
    if (existingQuery.rows.length > 0) {
      // Update existing record
      const updateQuery = `
        UPDATE medical_info 
        SET full_name = $2, dob = $3, blood_type = $4, address = $5, 
            allergies = $6, medications = $7, conditions = $8, 
            emergency_contact = $9, photo_url = $10, 
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *`;
      
      result = await pool.query(updateQuery, [
        user_id, full_name, dob, blood_type, address, 
        allergies, medications, conditions, emergency_contact, photo_base64
      ]);

      console.log('✅ Medical info updated successfully');
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO medical_info 
          (user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`;
      
      result = await pool.query(insertQuery, [
        user_id, full_name, dob, blood_type, address, 
        allergies, medications, conditions, emergency_contact, photo_base64
      ]);

      console.log('✅ Medical info saved successfully');
    }

    const savedRecord = result.rows[0];
    
    // Don't send the full base64 data in response to avoid large payloads
    const responseData = { ...savedRecord };
    if (responseData.photo_url && responseData.photo_url.startsWith('data:')) {
      responseData.has_photo = true;
      // Optionally send a small thumbnail or just indicate photo exists
    }

    res.json({ 
      success: true,
      message: existingQuery.rows.length > 0 ? 'Medical information updated successfully' : 'Medical information saved successfully',
      data: responseData
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:', err.message);
    
    let userMessage = 'Failed to save medical information';
    
    if (err.code === '23502') {
      userMessage = 'Missing required information';
    } else if (err.code === '23505') {
      userMessage = 'Medical information already exists for this user';
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage,
      error: err.message
    });
  }
});

// Test endpoints remain the same
router.post('/test-post', (req, res) => {
  console.log('✅ POST /api/medical/test-post hit successfully!');
  res.json({ 
    success: true, 
    message: 'POST request to medical route is working perfectly! 🎉',
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

router.post('/test-simple', (req, res) => {
  console.log('✅ POST /api/medical/test-simple hit successfully!');
  res.json({ 
    success: true, 
    message: 'Simple POST request is working!',
    timestamp: new Date().toISOString(),
    data: req.body
  });
});

router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Medical GET endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

export default router;
