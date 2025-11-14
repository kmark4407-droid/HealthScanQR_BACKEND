import express from 'express';
import multer from 'multer';
import pool from '../db.js';

const router = express.Router();

// ✅ Multer config for file upload
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ✅ Save or update medical info with photo
router.post('/update', upload.single('photo'), async (req, res) => {
  try {
    const {
      user_id, full_name, dob, blood_type,
      address, allergies, medications, conditions, emergency_contact
    } = req.body;

    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    // Check if user already has medical info
    const existing = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [user_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE medical_info 
         SET full_name=$2, dob=$3, blood_type=$4, address=$5, 
             allergies=$6, medications=$7, conditions=$8, emergency_contact=$9,
             photo_url = COALESCE($10, photo_url) -- keep old photo if new one not uploaded
         WHERE user_id=$1`,
        [user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url]
      );
      return res.json({ message: '✅ Medical info updated' });
    }

    // Otherwise insert new
    const result = await pool.query(
      `INSERT INTO medical_info 
         (user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user_id, full_name, dob, blood_type, address, allergies, medications, conditions, emergency_contact, photo_url]
    );

    res.json({ message: '✅ Medical info saved', data: result.rows[0] });
  } catch (err) {
    console.error('❌ Medical info error:', err.message);
    res.status(500).json({ message: 'Server error while saving medical info' });
  }
});

// ✅ Fetch medical info
router.get('/:user_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM medical_info WHERE user_id = $1`,
      [req.params.user_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('❌ Fetch error:', err.message);
    res.status(500).json({ message: 'Error fetching medical info' });
  }
});

export default router;
