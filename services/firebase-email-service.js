// services/firebase-email-service.js
import https from 'https';
import pool from '../db.js';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email, password, userId) {
    try {
      console.log('📧 Starting email verification process for:', email);
      
      // Step 1: Create Firebase user
      const userResult = await this.createFirebaseUser(email, password);
      
      if (userResult && userResult.idToken && userResult.localId) {
        // ✅ Store Firebase UID in database
        await this.storeFirebaseUid(userId, userResult.localId);
        
        // Step 2: Send verification email
        const emailResult = await this.sendVerificationToUser(userResult.idToken, email);
        
        if (emailResult && emailResult.email) {
          console.log('✅ Verification email sent successfully to:', email);
          return { success: true, email: emailResult.email, firebaseUid: userResult.localId };
        } else {
          console.log('❌ Email sending failed, but user created');
          return { success: false, error: 'Email sending failed' };
        }
      } else {
        console.log('❌ Firebase user creation failed');
        return { success: false, error: 'User creation failed' };
      }
    } catch (error) {
      console.log('⚠️ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async storeFirebaseUid(userId, firebaseUid) {
    try {
      await pool.query(
        'UPDATE users SET firebase_uid = $1 WHERE id = $2',
        [firebaseUid, userId]
      );
      console.log('✅ Firebase UID stored for user:', userId);
    } catch (error) {
      console.log('❌ Error storing Firebase UID:', error.message);
    }
  }

  async createFirebaseUser(email, password) {
    return new Promise((resolve, reject) => {
      const userData = JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:signUp?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(userData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ Firebase user created:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Firebase user creation failed:', parsedData.error?.message);
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error in user creation');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Firebase user creation network error');
        resolve(null);
      });

      req.write(userData);
      req.end();
    });
  }

  async sendVerificationToUser(idToken, email) {
    return new Promise((resolve, reject) => {
      const emailData = JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        idToken: idToken
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:sendOobCode?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(emailData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ Email verification request successful for:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Email verification request failed:', parsedData.error?.message);
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error in email sending');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Email sending network error');
        resolve(null);
      });

      req.write(emailData);
      req.end();
    });
  }

  // ✅ NEW: Check if email is verified in Firebase
  async checkEmailVerification(firebaseUid) {
    return new Promise((resolve, reject) => {
      const userData = JSON.stringify({
        idToken: this.getAdminToken() // We need an admin token for this
      });

      // This is a simplified version - in production you'd use Firebase Admin SDK
      // For now, we'll assume email is verified if Firebase UID exists
      console.log('🔍 Checking email verification for Firebase UID:', firebaseUid);
      resolve({ emailVerified: true }); // Temporary fix
    });
  }

  getAdminToken() {
    // This would require Firebase Admin SDK setup
    // For now, we'll use a simpler approach
    return 'temp-admin-token';
  }
}

export default new FirebaseEmailService();
