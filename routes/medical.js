// medical.js - FIXED PHOTO URL ISSUE
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

// ✅ FIXED: Save or update medical info - SIMPLIFIED PHOTO URL
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('🔄 Medical update request received');
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file);

    // Convert user_id to integer
    const user_id = parseInt(req.body.user_id);
    
    if (!user_id || isNaN(user_id)) {
      console.log('❌ Invalid user_id:', req.body.user_id);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID format.' 
      });
    }

    console.log('✅ User ID:', user_id);

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

    // ✅ FIX: Use relative path for photo_url instead of full URL
    let photo_url = null;
    if (req.file) {
      photo_url = `/uploads/${req.file.filename}`;
      console.log('📷 Photo URL:', photo_url);
    }

    console.log('📋 Processing data for user:', user_id);

    // Check if user already has medical info
    const existingQuery = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    console.log('📊 Existing records:', existingQuery.rows.length);

    if (existingQuery.rows.length > 0) {
      console.log('🔄 Updating existing medical info');
      
      // Build update query dynamically to handle optional photo
      let updateQuery;
      let queryParams;
      
      if (photo_url) {
        updateQuery = `
          UPDATE medical_info 
          SET full_name = $2, dob = $3, blood_type = $4, address = $5, 
              allergies = $6, medications = $7, conditions = $8, 
              emergency_contact = $9, photo_url = $10, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
          RETURNING *`;
        queryParams = [
          user_id, full_name, dob, blood_type, address, 
          allergies, medications, conditions, emergency_contact, photo_url
        ];
      } else {
        updateQuery = `
          UPDATE medical_info 
          SET full_name = $2, dob = $3, blood_type = $4, address = $5, 
              allergies = $6, medications = $7, conditions = $8, 
              emergency_contact = $9, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
          RETURNING *`;
        queryParams = [
          user_id, full_name, dob, blood_type, address, 
          allergies, medications, conditions, emergency_contact
        ];
      }
      
      const updateResult = await pool.query(updateQuery, queryParams);

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
    
    const insertResult = await pool.query(insertQuery, [
      user_id, full_name, dob, blood_type, address, 
      allergies, medications, conditions, emergency_contact, photo_url
    ]);

    console.log('✅ Medical info saved successfully');
    res.json({ 
      success: true,
      message: 'Medical information saved successfully', 
      data: insertResult.rows[0] 
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    console.error('Detail:', err.detail);
    
    let userMessage = 'Failed to save medical information';
    
    if (err.code === '23502') {
      userMessage = 'Missing required information';
    } else if (err.code === '23505') {
      userMessage = 'Medical information already exists';
    } else if (err.code === '42703') {
      userMessage = 'Database error - please contact support';
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage,
      error: err.message
    });
  } finally {
    console.log('=== MEDICAL UPDATE REQUEST END ===');
  }
});

// Add a simple test endpoint
router.post('/test', (req, res) => {
  console.log('✅ Medical test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Medical endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

export default router;
