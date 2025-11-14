import express from 'express';
import multer from 'multer';
import pool from '../db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Multer config for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../uploads');
    console.log('📁 Uploads directory:', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + '-' + file.originalname;
    console.log('📸 Saving file as:', filename);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// ✅ Save or update medical info with photo - FIXED FOR YOUR TABLE STRUCTURE
router.post('/update', upload.single('photo'), async (req, res) => {
  console.log('=== MEDICAL UPDATE REQUEST START ===');
  
  try {
    console.log('🔄 Medical update request received');
    console.log('📦 Request body:', req.body);
    console.log('📸 File details:', req.file ? {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size
    } : 'No file uploaded');

    // Validate required fields
    const requiredFields = ['user_id', 'full_name', 'dob', 'blood_type', 'address', 'emergency_contact'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      return res.status(400).json({ 
        message: 'Missing required fields', 
        missing: missingFields 
      });
    }

    const {
      user_id, full_name, dob, blood_type,
      address, allergies = '', medications = '', conditions = '', emergency_contact
    } = req.body;

    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    console.log('📋 Processed data:', {
      user_id, full_name, dob, blood_type, address,
      allergies, medications, conditions, emergency_contact, photo_url
    });

    // Check if user already has medical info
    console.log('🔍 Checking existing medical info for user:', user_id);
    const existingQuery = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
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
      
      console.log('📝 Update query executing...');
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
        message: '✅ Medical info updated',
        data: updateResult.rows[0]
      });
    }

    // Otherwise insert new
    console.log('🆕 Inserting new medical info');
    const insertQuery = `
      INSERT INTO medical_info 
        (user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`;
    
    console.log('📝 Insert query executing...');
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
      message: '✅ Medical info saved', 
      data: insertResult.rows[0] 
    });

  } catch (err) {
    console.error('❌ MEDICAL UPDATE ERROR:');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error detail:', err.detail);
    
    // Specific error handling
    let userMessage = 'Server error while saving medical info';
    
    if (err.code === '23502') { // not-null violation
      userMessage = 'Missing required field: ' + err.detail;
    } else if (err.code === '23505') { // unique violation
      userMessage = 'Medical info already exists for this user';
    } else if (err.code === '42703') { // undefined column
      userMessage = 'Database column error - please contact support';
    } else if (err.code === '22P02') { // invalid input syntax
      userMessage = 'Invalid data format - please check your entries';
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

// ✅ Fetch medical info
router.get('/:user_id', async (req, res) => {
  try {
    const userId = req.params.user_id;
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
      ...result.rows[0]
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

export default router;
