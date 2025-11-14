// medical.js - FIXED VERSION WITH ABSOLUTE PHOTO URLS
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

// ✅ Get base URL for absolute photo URLs
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
    const fileExt = path.extname(file.originalname);
    const uniqueName = `profile-${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
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

// ✅ IMPROVED: GET medical information by user_id with ABSOLUTE photo URLs
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
    console.log('✅ Medical info found:', medicalInfo);

    // ✅ FIXED: Create ABSOLUTE photo URL that frontend can use directly
    let photo_url = medicalInfo.photo_url;
    if (photo_url) {
      // If it's already an absolute URL, keep it
      if (photo_url.startsWith('http')) {
        // Do nothing, it's already absolute
      } 
      // If it's a relative path, convert to absolute
      else if (photo_url.startsWith('/uploads/')) {
        photo_url = `${getBaseUrl()}${photo_url}`;
      }
      // If it's just a filename, construct the full path
      else {
        photo_url = `${getBaseUrl()}/uploads/${photo_url}`;
      }
    }

    console.log('🖼️ Final photo URL for frontend:', photo_url);

    res.json({
      success: true,
      exists: true,
      ...medicalInfo,
      photo_url: photo_url // ✅ Return ABSOLUTE URL that frontend can use directly
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

// ✅ IMPROVED: Save or update medical info with ABSOLUTE photo URLs
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📄 File:', req.file ? `Uploaded: ${req.file.filename}` : 'No file');

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

    // ✅ Store relative path in database, but return absolute URL to frontend
    let photo_url = null;
    let absolute_photo_url = null;
    
    if (req.file) {
      photo_url = `/uploads/${req.file.filename}`; // Store relative path in DB
      absolute_photo_url = `${getBaseUrl()}${photo_url}`; // Create absolute URL for response
      console.log('🖼️ Photo paths - Relative:', photo_url, 'Absolute:', absolute_photo_url);
    }

    // Check if medical info already exists
    const existingQuery = await pool.query(
      `SELECT id, photo_url FROM medical_info WHERE user_id = $1`,
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
    
    // ✅ FIXED: Return ABSOLUTE photo URL to frontend
    let responsePhotoUrl = savedRecord.photo_url;
    if (responsePhotoUrl && !responsePhotoUrl.startsWith('http')) {
      if (responsePhotoUrl.startsWith('/uploads/')) {
        responsePhotoUrl = `${getBaseUrl()}${responsePhotoUrl}`;
      } else {
        responsePhotoUrl = `${getBaseUrl()}/uploads/${responsePhotoUrl}`;
      }
    }

    console.log('🎯 Sending to frontend - Photo URL:', responsePhotoUrl);

    res.json({ 
      success: true,
      message: existingQuery.rows.length > 0 ? 'Medical information updated successfully' : 'Medical information saved successfully',
      data: {
        ...savedRecord,
        photo_url: responsePhotoUrl // ✅ Send ABSOLUTE URL to frontend
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

// Test POST route
router.post('/test-post', (req, res) => {
  console.log('✅ POST /api/medical/test-post hit successfully!');
  
  res.json({ 
    success: true, 
    message: 'POST request to medical route is working perfectly! 🎉',
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

// Simple POST without multer for testing
router.post('/test-simple', (req, res) => {
  console.log('✅ POST /api/medical/test-simple hit successfully!');
  
  res.json({ 
    success: true, 
    message: 'Simple POST request is working!',
    timestamp: new Date().toISOString(),
    data: req.body
  });
});

// Test GET endpoint
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Medical GET endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

export default router;
