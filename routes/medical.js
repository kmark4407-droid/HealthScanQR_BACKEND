// medical.js - REVISED WITH BETTER MOBILE SUPPORT
import express from 'express';
import multer from 'multer';
import pool from '../db.js';

const router = express.Router();

// ✅ ENHANCED: Better memory storage for mobile compatibility
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Increased to 5MB for mobile photos
    files: 1,
    fields: 20
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WebP are allowed.`), false);
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
    console.log('✅ Medical info found, has photo:', !!medicalInfo.photo_url);

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

// ✅ FIXED: Enhanced save/update with better mobile handling
router.post('/update', (req, res, next) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  console.log('📦 Request headers:', req.headers);
  
  // Parse the multipart/form-data manually to understand what's coming
  next();
}, upload.single('photo'), async (req, res) => {
  try {
    console.log('📝 Form fields received:', Object.keys(req.body));
    console.log('📄 File received:', req.file ? {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      fieldname: req.file.fieldname
    } : 'No file received');
    
    console.log('🔧 Raw body keys:', Object.keys(req.body));
    console.log('🔧 Raw body values:', req.body);

    // Extract and validate user_id
    let user_id;
    try {
      user_id = parseInt(req.body.user_id);
      console.log('🔑 Parsed user_id:', user_id, 'Type:', typeof user_id);
    } catch (parseError) {
      console.error('❌ Error parsing user_id:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format. Must be a number.'
      });
    }
    
    if (!user_id || isNaN(user_id) || user_id <= 0) {
      console.log('❌ Invalid user_id:', req.body.user_id);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or missing user ID' 
      });
    }

    // Validate required fields
    const requiredFields = ['full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: ' + missingFields.join(', '),
        missing: missingFields 
      });
    }

    // Extract form data
    const {
      full_name, 
      dob, 
      blood_type,
      address, 
      allergies = '', 
      medications = '', 
      conditions = '', 
      emergency_contact
    } = req.body;

    console.log('✅ All required fields present');
    console.log('📋 Form data:', {
      user_id,
      full_name: full_name?.substring(0, 30) + '...',
      dob,
      blood_type,
      address: address?.substring(0, 30) + '...',
      emergency_contact
    });

    // ✅ FIXED: Process image for mobile compatibility
    let photo_url = null;
    if (req.file) {
      try {
        console.log('📸 Processing uploaded image...');
        
        // Check if file is actually an image
        if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
          console.log('❌ Invalid file type:', req.file.mimetype);
          return res.status(400).json({
            success: false,
            message: 'Uploaded file must be an image (JPEG, PNG, GIF, WebP)'
          });
        }

        // Check file size (already done by multer, but double-check)
        if (req.file.size > 5 * 1024 * 1024) {
          console.log('❌ File too large:', req.file.size, 'bytes');
          return res.status(400).json({
            success: false,
            message: 'Image size must be less than 5MB'
          });
        }

        // Convert buffer to base64
        const base64Image = req.file.buffer.toString('base64');
        photo_url = `data:${req.file.mimetype};base64,${base64Image}`;
        
        console.log('💾 Image converted to base64 successfully');
        console.log('📊 Base64 length:', base64Image.length, 'chars');
        console.log('📊 MIME type:', req.file.mimetype);

      } catch (base64Error) {
        console.error('❌ Base64 conversion error:', base64Error);
        return res.status(500).json({
          success: false,
          message: 'Error processing image file. Please try a different image.',
          error: base64Error.message
        });
      }
    } else {
      console.log('⚠️ No photo uploaded, will use existing photo if updating');
    }

    // Check if medical info already exists
    const existingQuery = await pool.query(
      `SELECT id, photo_url FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    console.log('🔍 Checking for existing medical info:', existingQuery.rows.length > 0 ? 'Exists' : 'New');

    let result;
    let isUpdate = false;
    
    if (existingQuery.rows.length > 0) {
      // Update existing record
      isUpdate = true;
      const existingRecord = existingQuery.rows[0];
      
      // Use existing photo if no new photo uploaded
      const finalPhotoUrl = photo_url || existingRecord.photo_url;
      
      const updateQuery = `
        UPDATE medical_info 
        SET full_name = $2, dob = $3, blood_type = $4, address = $5, 
            allergies = $6, medications = $7, conditions = $8, 
            emergency_contact = $9, photo_url = $10, 
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *`;
      
      console.log('🔄 Updating existing record...');
      
      result = await pool.query(updateQuery, [
        user_id, 
        full_name, 
        dob, 
        blood_type, 
        address, 
        allergies || '', 
        medications || '', 
        conditions || '', 
        emergency_contact, 
        finalPhotoUrl
      ]);

      console.log('✅ Medical info updated successfully');
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO medical_info 
          (user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`;
      
      console.log('➕ Inserting new record...');
      
      result = await pool.query(insertQuery, [
        user_id, 
        full_name, 
        dob, 
        blood_type, 
        address, 
        allergies || '', 
        medications || '', 
        conditions || '', 
        emergency_contact, 
        photo_url
      ]);

      console.log('✅ Medical info saved successfully');
    }

    const savedRecord = result.rows[0];
    
    console.log('🎯 Medical info saved/updated for user:', user_id);
    console.log('📊 Record ID:', savedRecord.id);
    console.log('📊 Has photo:', !!savedRecord.photo_url);

    res.json({ 
      success: true,
      message: isUpdate ? 'Medical information updated successfully' : 'Medical information saved successfully',
      data: {
        id: savedRecord.id,
        user_id: savedRecord.user_id,
        full_name: savedRecord.full_name,
        has_photo: !!savedRecord.photo_url
      }
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:', err.message);
    console.error('❌ Error stack:', err.stack);
    
    let userMessage = 'Failed to save medical information';
    let statusCode = 500;
    
    if (err.code === '23502') {
      userMessage = 'Missing required information';
      statusCode = 400;
    } else if (err.code === '23505') {
      userMessage = 'Medical information already exists for this user';
      statusCode = 409;
    } else if (err.code === '23503') {
      userMessage = 'User not found. Please log in again.';
      statusCode = 404;
    } else if (err.message && err.message.includes('file too large')) {
      userMessage = 'Image file is too large. Please use an image smaller than 5MB.';
      statusCode = 400;
    } else if (err.message && err.message.includes('Unsupported file type')) {
      userMessage = err.message;
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      success: false,
      message: userMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ New endpoint: Check if user has medical info
router.get('/has-info/:user_id', async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id);
    
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({ 
        success: false,
        hasInfo: false,
        message: 'Invalid user ID' 
      });
    }

    const result = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    const hasInfo = result.rows.length > 0;
    
    res.json({
      success: true,
      hasInfo: hasInfo,
      message: hasInfo ? 'User has medical information' : 'User has no medical information'
    });

  } catch (err) {
    console.error('❌ Check has-info error:', err.message);
    res.status(500).json({ 
      success: false,
      hasInfo: false,
      message: 'Server error checking medical information'
    });
  }
});

// ✅ Test endpoint with detailed logging
router.post('/test-upload', upload.single('test_file'), (req, res) => {
  console.log('🧪 Test upload received');
  console.log('🧪 Headers:', req.headers);
  console.log('🧪 Body keys:', Object.keys(req.body));
  console.log('🧪 File:', req.file ? {
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    fieldname: req.file.fieldname
  } : 'No file');

  res.json({
    success: true,
    message: 'Test upload successful',
    received: {
      bodyFields: Object.keys(req.body),
      file: req.file ? {
        received: true,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      } : { received: false }
    },
    timestamp: new Date().toISOString()
  });
});

// Test GET endpoint
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Medical GET endpoint is working!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /update - Save/update medical info',
      'GET /:user_id - Get medical info by user ID',
      'GET /has-info/:user_id - Check if user has medical info',
      'POST /test-upload - Test file upload',
      'GET /test - Test endpoint'
    ]
  });
});

export default router;
