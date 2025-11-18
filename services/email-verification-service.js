// services/email-verification-service.js - NEW SERVICE
import pool from '../db.js';

class EmailVerificationService {
  
  // ✅ INSTANT VERIFICATION - This will definitely work
  async verifyEmailInstantly(email) {
    try {
      console.log('🔄 INSTANT VERIFICATION for:', email);
      
      const result = await pool.query(
        `UPDATE users SET email_verified = true, updated_at = NOW() 
         WHERE email = $1 
         RETURNING id, email, email_verified`,
        [email]
      );

      if (result.rows.length === 0) {
        console.log('❌ User not found for verification:', email);
        return { success: false, message: 'User not found' };
      }

      const user = result.rows[0];
      console.log('✅ INSTANT VERIFICATION SUCCESS for:', email);
      
      return { 
        success: true, 
        message: 'Email verified successfully!',
        user: user 
      };
      
    } catch (error) {
      console.error('❌ Instant verification error:', error.message);
      return { success: false, message: 'Database error: ' + error.message };
    }
  }

  // ✅ BULK VERIFY ALL USERS
  async verifyAllUsers() {
    try {
      console.log('🔄 Verifying ALL users...');
      
      const result = await pool.query(
        `UPDATE users SET email_verified = true, updated_at = NOW() 
         WHERE email_verified = false 
         RETURNING id, email, email_verified`
      );

      console.log(`✅ BULK VERIFICATION: ${result.rows.length} users verified`);
      
      return { 
        success: true, 
        message: `Verified ${result.rows.length} users`,
        users: result.rows 
      };
      
    } catch (error) {
      console.error('❌ Bulk verification error:', error.message);
      return { success: false, message: 'Database error: ' + error.message };
    }
  }

  // ✅ GET VERIFICATION STATUS
  async getVerificationStatus(email) {
    try {
      const result = await pool.query(
        'SELECT id, email, email_verified, firebase_uid, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return { success: false, message: 'User not found' };
      }

      const user = result.rows[0];
      
      return {
        success: true,
        user: user,
        isVerified: user.email_verified,
        message: user.email_verified ? 'VERIFIED' : 'NOT VERIFIED'
      };
      
    } catch (error) {
      console.error('❌ Get status error:', error.message);
      return { success: false, message: 'Database error: ' + error.message };
    }
  }

  // ✅ GET ALL USERS WITH STATUS
  async getAllUsersWithStatus() {
    try {
      const result = await pool.query(
        `SELECT id, email, email_verified, firebase_uid, created_at 
         FROM users 
         ORDER BY created_at DESC`
      );

      return {
        success: true,
        users: result.rows,
        total: result.rows.length,
        verified: result.rows.filter(u => u.email_verified).length,
        notVerified: result.rows.filter(u => !u.email_verified).length
      };
      
    } catch (error) {
      console.error('❌ Get all users error:', error.message);
      return { success: false, message: 'Database error: ' + error.message };
    }
  }
}

export default new EmailVerificationService();
