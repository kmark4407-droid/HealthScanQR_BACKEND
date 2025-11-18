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
              
              // If user already exists, try to sign in instead
              if (parsedData.error?.message?.includes('EMAIL_EXISTS')) {
                console.log('🔄 User already exists, attempting sign in...');
                this.signInFirebaseUser(email, password).then(resolve).catch(reject);
              } else {
                resolve(null);
              }
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

  async signInFirebaseUser(email, password) {
    return new Promise((resolve, reject) => {
      const userData = JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:signInWithPassword?key=${this.apiKey}`,
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
              console.log('✅ Firebase user signed in:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Firebase sign in failed:', parsedData.error?.message);
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error in user sign in');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Firebase sign in network error');
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

  // ✅ IMPROVED: Firebase User Deletion with better error handling
  async deleteFirebaseUser(firebaseUid) {
    return new Promise((resolve, reject) => {
      if (!firebaseUid) {
        console.log('⚠️ No Firebase UID provided for deletion');
        resolve({ success: true, message: 'No Firebase UID to delete' });
        return;
      }

      console.log('🔥 Attempting to delete Firebase user via REST API:', firebaseUid);

      // Note: This REST API approach has limitations without Admin SDK
      // For now, we'll log the UID that needs manual deletion
      console.log('⚠️ Firebase user deletion requires Admin SDK for proper deletion');
      console.log('⚠️ Firebase UID that needs manual deletion:', firebaseUid);
      
      resolve({ 
        success: false, 
        error: 'Firebase Admin SDK required for user deletion',
        message: 'Firebase user deletion requires manual cleanup in Firebase Console',
        firebaseUid: firebaseUid
      });
    });
  }

  // ✅ ALTERNATIVE: Delete by email (for reference)
  async deleteFirebaseUserByEmail(email) {
    return new Promise((resolve, reject) => {
      if (!email) {
        resolve({ success: false, error: 'Email required' });
        return;
      }

      console.log('🔥 Attempting to delete Firebase user by email:', email);

      // First, try to get the user by email
      this.getFirebaseUserByEmail(email).then(user => {
        if (user && user.localId) {
          // If we found the user, delete by UID
          this.deleteFirebaseUser(user.localId).then(resolve).catch(resolve);
        } else {
          console.log('ℹ️ Firebase user not found by email, may already be deleted');
          resolve({ success: true, message: 'User not found in Firebase (may already be deleted)' });
        }
      }).catch(error => {
        console.log('❌ Error finding Firebase user by email:', error);
        resolve({ success: false, error: error.message });
      });
    });
  }

  async getFirebaseUserByEmail(email) {
    return new Promise((resolve, reject) => {
      const userData = JSON.stringify({
        email: email
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:lookup?key=${this.apiKey}`,
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
            if (res.statusCode === 200 && parsedData.users && parsedData.users.length > 0) {
              console.log('✅ Found Firebase user:', email);
              resolve(parsedData.users[0]);
            } else {
              console.log('❌ Firebase user not found:', email);
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error in user lookup');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Firebase user lookup network error');
        resolve(null);
      });

      req.write(userData);
      req.end();
    });
  }

  // ✅ NEW: Check if user email is verified in Firebase
  async checkEmailVerification(idToken) {
    return new Promise((resolve, reject) => {
      const verificationData = JSON.stringify({
        idToken: idToken
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:lookup?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(verificationData)
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
            if (res.statusCode === 200 && parsedData.users && parsedData.users.length > 0) {
              const user = parsedData.users[0];
              const isVerified = user.emailVerified || false;
              console.log('✅ Email verification status for', user.email, ':', isVerified);
              resolve({ success: true, emailVerified: isVerified, user: user });
            } else {
              console.log('❌ Failed to check email verification');
              resolve({ success: false, error: 'Failed to check verification status' });
            }
          } catch (error) {
            console.log('❌ JSON parse error in verification check');
            resolve({ success: false, error: error.message });
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Verification check network error');
        resolve({ success: false, error: error.message });
      });

      req.write(verificationData);
      req.end();
    });
  }
}

export default new FirebaseEmailService();
