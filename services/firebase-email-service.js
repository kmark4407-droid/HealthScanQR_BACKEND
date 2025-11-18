// services/firebase-email-service.js - SIMPLIFIED VERSION
import https from 'https';
import pool from '../db.js';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email, password, userId) {
    try {
      console.log('📧 Starting email verification for:', email);
      
      // Step 1: Create Firebase user
      const userResult = await this.createFirebaseUser(email, password);
      
      if (userResult && userResult.idToken && userResult.localId) {
        // Store Firebase UID in database
        await this.storeFirebaseUid(userId, userResult.localId);
        
        // Step 2: Send verification email
        const emailResult = await this.sendVerificationToUser(userResult.idToken, email);
        
        if (emailResult && emailResult.email) {
          console.log('✅ Verification email sent to:', email);
          
          // Schedule a verification check after 30 seconds
          setTimeout(() => {
            this.scheduleVerificationCheck(email, userResult.localId);
          }, 30000);
          
          return { 
            success: true, 
            email: emailResult.email, 
            firebaseUid: userResult.localId,
            message: 'Check your email and use /api/auth/force-verify if needed'
          };
        } else {
          console.log('❌ Email sending failed');
          return { 
            success: false, 
            error: 'Email sending failed',
            message: 'Use /api/auth/force-verify to verify manually'
          };
        }
      } else {
        console.log('❌ Firebase user creation failed');
        return { 
          success: false, 
          error: 'User creation failed',
          message: 'Use /api/auth/force-verify to verify manually'
        };
      }
    } catch (error) {
      console.log('⚠️ Email service error:', error.message);
      return { 
        success: false, 
        error: error.message,
        message: 'Use /api/auth/force-verify to verify manually'
      };
    }
  }

  async scheduleVerificationCheck(email, firebaseUid) {
    console.log('⏰ Scheduling verification check for:', email);
    
    try {
      // Check if email is verified in Firebase
      const isVerified = await this.checkFirebaseVerification(firebaseUid);
      
      if (isVerified) {
        console.log('✅ Email verified in Firebase, updating database for:', email);
        
        // Update database
        await pool.query(
          'UPDATE users SET email_verified = true WHERE firebase_uid = $1',
          [firebaseUid]
        );
        
        console.log('✅ Database updated for:', email);
      } else {
        console.log('❌ Email not verified yet in Firebase for:', email);
        
        // Schedule another check in 30 seconds
        setTimeout(() => {
          this.scheduleVerificationCheck(email, firebaseUid);
        }, 30000);
      }
    } catch (error) {
      console.log('⚠️ Verification check failed:', error.message);
    }
  }

  async checkFirebaseVerification(firebaseUid) {
    return new Promise((resolve, reject) => {
      if (!firebaseUid) {
        resolve(false);
        return;
      }

      const userData = JSON.stringify({
        localId: [firebaseUid]
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
              const user = parsedData.users[0];
              const isVerified = user.emailVerified || false;
              console.log('🔍 Firebase verification check for', user.email, ':', isVerified);
              resolve(isVerified);
            } else {
              console.log('❌ Firebase verification check failed');
              resolve(false);
            }
          } catch (error) {
            console.log('❌ JSON parse error in verification check');
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Verification check network error');
        resolve(false);
      });

      req.write(userData);
      req.end();
    });
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
              
              if (parsedData.error?.message?.includes('EMAIL_EXISTS')) {
                console.log('🔄 User exists, signing in...');
                this.signInFirebaseUser(email, password).then(resolve).catch(reject);
              } else {
                resolve(null);
              }
            }
          } catch (error) {
            console.log('❌ JSON parse error');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error');
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
              console.log('❌ Firebase sign in failed');
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error');
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
              console.log('✅ Email verification sent to:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Email verification failed');
              resolve(null);
            }
          } catch (error) {
            console.log('❌ JSON parse error');
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error');
        resolve(null);
      });

      req.write(emailData);
      req.end();
    });
  }
}

export default new FirebaseEmailService();
