// medical.js - MOBILE FIXED VERSION
import express from 'express';
import multer from 'multer';
import pool from '../db.js';

const router = express.Router();

// ✅ FIXED: Enhanced multer configuration for mobile
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for mobile cameras
    files: 1 // Only one file
  },
  fileFilter: (req, file, cb) => {
    console.log('📱 File filter - MIME type:', file.mimetype, 'Original name:', file.originalname);
    
    // Allow common mobile image formats
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic', // iPhone format
      'image/heif'  // iPhone format
    ];
    
    // Check extension too (mobile sometimes sends wrong mime)
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    const fileExt = file.originalname.toLowerCase().match(/\.[0-9a-z]+$/)?.[0] || '';
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
      console.log('✅ File accepted:', file.originalname);
      cb(null, true);
    } else {
      console.log('❌ File rejected - Invalid type:', file.mimetype, 'Extension:', fileExt);
      cb(new Error('Only image files are allowed! (JPEG, PNG, GIF, WEBP, HEIC)'), false);
    }
  }
});

// ✅ Handle preflight requests for medical endpoints
router.options('/update', (req, res) => {
  console.log('🛫 Medical update preflight request');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// ✅ GET medical information by user_id
router.get('/:user_id', async (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    
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

// ✅ FIXED: Save or update medical info - MOBILE COMPATIBLE
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== 🏥 MEDICAL UPDATE REQUEST START ===');
  console.log('📱 User-Agent:', req.headers['user-agent']);
  console.log('🌐 Origin:', req.headers.origin);
  
  // Set CORS headers for response
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  try {
    console.log('📦 Request body keys:', Object.keys(req.body || {}));
    console.log('📄 File received:', req.file ? `✅ Uploaded: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})` : '❌ No file');
    
    // Debug: Log all body fields
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        console.log(`   ${key}: ${req.body[key] ? (key === 'photo' ? '[FILE]' : req.body[key].substring(0, 50)) : 'EMPTY'}`);
      });
    }

    // Convert user_id to integer
    const user_id = parseInt(req.body.user_id);
    
    if (!user_id || isNaN(user_id)) {
      console.log('❌ Invalid user_id:', req.body.user_id);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID format',
        received_user_id: req.body.user_id
      });
    }

    console.log('👤 Processing for user_id:', user_id);

    // Validate required fields
    const requiredFields = ['full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => !req.body[field] || req.body[field].trim() === '');
    
    if (missingFields.length > 0) {
      console.log('❌ Missing fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: ' + missingFields.join(', '),
        missing: missingFields,
        received_data: req.body
      });
    }

    const {
      full_name, dob, blood_type,
      address, allergies = '', medications = '', conditions = '', emergency_contact
    } = req.body;

    console.log('📝 Processing fields - Name:', full_name, 'Blood:', blood_type);

    // ✅ FIXED: Convert image to base64 for database storage
    let photo_url = null;
    if (req.file) {
      try {
        // Convert buffer to base64
        const base64Image = req.file.buffer.toString('base64');
        photo_url = `data:${req.file.mimetype};base64,${base64Image}`;
        console.log('💾 Image converted to base64, size:', base64Image.length, 'chars');
      } catch (base64Error) {
        console.error('❌ Base64 conversion error:', base64Error);
        return res.status(400).json({
          success: false,
          message: 'Error processing image file',
          error: base64Error.message
        });
      }
    } else {
      console.log('⚠️ No photo uploaded - this might be intentional');
    }

    // Check if medical info already exists
    const existingQuery = await pool.query(
      `SELECT id FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    console.log('📊 Existing records found:', existingQuery.rows.length);

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
      
      console.log('🔄 Updating existing medical info...');
      
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
      
      console.log('➕ Inserting new medical info...');
      
      result = await pool.query(insertQuery, [
        user_id, full_name, dob, blood_type, address, 
        allergies, medications, conditions, emergency_contact, photo_url
      ]);

      console.log('✅ Medical info saved successfully');
    }

    const savedRecord = result.rows[0];
    
    console.log('🎯 Medical info saved/updated for user:', user_id);
    console.log('=== 🏥 MEDICAL UPDATE REQUEST END ===');

    res.json({ 
      success: true,
      message: existingQuery.rows.length > 0 ? 'Medical information updated successfully' : 'Medical information saved successfully',
      data: savedRecord,
      photo_saved: !!photo_url
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:', err.message);
    console.error('❌ Error stack:', err.stack);
    
    let userMessage = 'Failed to save medical information';
    
    if (err.code === '23502') { // Not null violation
      userMessage = 'Missing required information';
    } else if (err.code === '23505') { // Unique violation
      userMessage = 'Medical information already exists for this user';
    } else if (err.code === '23503') { // Foreign key violation
      userMessage = 'User not found';
    } else if (err.message.includes('multer')) {
      userMessage = 'File upload error: ' + err.message;
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage,
      error: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ✅ Test endpoint to verify base64 is working
router.post('/test-base64', upload.single('test_photo'), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided for test'
      });
    }

    // Convert to base64
    const base64Image = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

    console.log('🧪 Base64 test - Original size:', req.file.size, 'bytes');
    console.log('🧪 Base64 test - Base64 length:', base64Image.length, 'chars');
    console.log('🧪 Base64 test - MIME type:', req.file.mimetype);

    res.json({
      success: true,
      message: 'Base64 conversion successful',
      original_size: req.file.size,
      base64_length: base64Image.length,
      mime_type: req.file.mimetype,
      original_name: req.file.originalname,
      // Return a small preview (first 100 chars)
      base64_preview: dataURI.substring(0, 100) + '...',
      user_agent: req.headers['user-agent']
    });

  } catch (err) {
    console.error('❌ Base64 test error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Base64 test failed',
      error: err.message
    });
  }
});

// Test POST route
router.post('/test-post', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  console.log('✅ POST /api/medical/test-post hit successfully!');
  console.log('📱 User-Agent:', req.headers['user-agent']);
  res.json({ 
    success: true, 
    message: 'POST request to medical route is working perfectly! 🎉',
    timestamp: new Date().toISOString(),
    receivedData: req.body,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']
  });
});

// Simple POST without multer for testing
router.post('/test-simple', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  console.log('✅ POST /api/medical/test-simple hit successfully!');
  res.json({ 
    success: true, 
    message: 'Simple POST request is working!',
    timestamp: new Date().toISOString(),
    data: req.body,
    origin: req.headers.origin
  });
});

// Test GET endpoint
router.get('/test', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.json({ 
    success: true, 
    message: 'Medical GET endpoint is working!',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin
  });
});

// Add CORS headers to all responses
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

export default router;
