// medical.js - FIXED VERSION WITH ABSOLUTE URLS FOR RENDER
import express from 'express';
import multer from 'multer';
import pool from '../db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Get the correct base URL for Render
const getBaseUrl = () => {
  return process.env.NODE_ENV === 'production' 
    ? 'https://healthscanqr-backend.onrender.com'
    : 'http://localhost:3000';
};

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
    console.log('📄 Generated filename:', uniqueName);
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

// ✅ FIXED: GET medical information with ABSOLUTE photo URLs
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

    // ✅ FIXED: Convert relative photo_url to absolute URL
    let photo_url = medicalInfo.photo_url;
    if (photo_url && !photo_url.startsWith('http')) {
      if (photo_url.startsWith('/uploads/')) {
        photo_url = `${getBaseUrl()}${photo_url}`;
      } else if (photo_url.startsWith('uploads/')) {
        photo_url = `${getBaseUrl()}/${photo_url}`;
      } else {
        photo_url = `${getBaseUrl()}/uploads/${photo_url}`;
      }
      console.log('🖼️ Converted photo URL to:', photo_url);
    }

    res.json({
      success: true,
      exists: true,
      ...medicalInfo,
      photo_url: photo_url // Return absolute URL
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

// ✅ FIXED: Save medical info with ABSOLUTE URL in response
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📄 File:', req.file ? `Uploaded: ${req.file.filename}` : 'No file');

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

    // Store relative path in database
    let photo_url = null;
    if (req.file) {
      photo_url = `/uploads/${req.file.filename}`; // Store relative path
      console.log('💾 Storing relative photo URL in DB:', photo_url);
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
            emergency_contact = $9, photo_url = COALESCE($10, photo_url), 
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *`;
      
      result = await pool.query(updateQuery, [
        user_id, full_name, dob, blood_type, address, 
        allergies, medications, conditions, emergency_contact, photo_url
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
        allergies, medications, conditions, emergency_contact, photo_url
      ]);

      console.log('✅ Medical info saved successfully');
    }

    const savedRecord = result.rows[0];
    
    // ✅ FIXED: Return ABSOLUTE URL to frontend in response
    let responsePhotoUrl = savedRecord.photo_url;
    if (responsePhotoUrl && !responsePhotoUrl.startsWith('http')) {
      if (responsePhotoUrl.startsWith('/uploads/')) {
        responsePhotoUrl = `${getBaseUrl()}${responsePhotoUrl}`;
      } else {
        responsePhotoUrl = `${getBaseUrl()}/uploads/${responsePhotoUrl}`;
      }
    }

    console.log('🎯 Sending to frontend - Absolute Photo URL:', responsePhotoUrl);

    res.json({ 
      success: true,
      message: existingQuery.rows.length > 0 ? 'Medical information updated successfully' : 'Medical information saved successfully',
      data: {
        ...savedRecord,
        photo_url: responsePhotoUrl // Send absolute URL to frontend
      }
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

// Test if uploads are working
router.get('/debug/uploads', (req, res) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({
      success: true,
      uploadsDir,
      files: files,
      exists: true,
      baseUrl: getBaseUrl()
    });
  } catch (err) {
    res.json({
      success: false,
      uploadsDir,
      error: err.message,
      exists: false,
      baseUrl: getBaseUrl()
    });
  }
});

// Test endpoints
router.post('/test-post', (req, res) => {
  res.json({ 
    success: true, 
    message: 'POST request to medical route is working!',
    timestamp: new Date().toISOString()
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
