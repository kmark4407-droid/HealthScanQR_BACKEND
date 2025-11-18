// services/firebase-email-service.js - WORKING VERSION WITH SYNC
import https from 'https';
import pool from '../db.js';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email, password, userId) {
    try {
      console.log('📧 STARTING EMAIL VERIFICATION PROCESS FOR:', email);
      
      // Step 1: Create Firebase user
      console.log('🔄 Step 1: Creating Firebase user...');
      const userResult = await this.createFirebaseUser(email, password);
      
      if (userResult && userResult.localId) {
        console.log('✅ Firebase user created successfully');
        
        // Step 2: Store Firebase UID in database
        console.log('🔄 Step 2: Storing Firebase UID...');
        await this.storeFirebaseUidSimple(userId, userResult.localId);
        
        // Step 3: Send verification email
        console.log('🔄 Step 3: Sending verification email...');
        if (userResult.idToken) {
          const emailResult = await this.sendVerificationToUser(userResult.idToken);
          
          if (emailResult && emailResult.email) {
            console.log('🎉 ✅ VERIFICATION EMAIL SENT SUCCESSFULLY TO:', email);
            return { 
              success: true, 
              email: email,
              firebaseUid: userResult.localId,
              message: 'Registration successful! Please check your email for verification link.',
              emailSent: true
            };
          }
        }
        
        return { 
          success: true, 
          email: email,
          firebaseUid: userResult.localId,
          message: 'Registration completed but email verification failed. Please use resend verification.',
          emailSent: false
        };
        
      } else {
        console.log('❌ Firebase user creation failed');
        return { 
          success: false, 
          error: 'Firebase user creation failed',
          message: 'Registration failed.'
        };
      }
    } catch (error) {
      console.log('❌ Email service error:', error.message);
      return { 
        success: false, 
        error: error.message,
        message: 'Registration failed due to server error.'
      };
    }
  }

  async createFirebaseUser(email, password) {
    return new Promise((resolve, reject) => {
      console.log('🔥 Creating Firebase user for:', email);
      
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
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 Firebase API response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log('✅ Firebase user creation SUCCESS');
              resolve(parsedData);
            } else {
              console.log('❌ Firebase user creation FAILED:', parsedData.error);
              
              if (parsedData.error && parsedData.error.message && 
                  parsedData.error.message.includes('EMAIL_EXISTS')) {
                console.log('🔄 Email exists, attempting sign in...');
                this.signInFirebaseUser(email, password)
                  .then(resolve)
                  .catch(signInError => {
                    reject(new Error('Email exists but sign in failed'));
                  });
              } else {
                reject(new Error(parsedData.error?.message || 'Firebase user creation failed'));
              }
            }
          } catch (error) {
            reject(new Error('Failed to parse Firebase response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Firebase request timeout'));
      });

      req.write(userData);
      req.end();
    });
  }

  async sendVerificationToUser(idToken) {
    return new Promise((resolve, reject) => {
      console.log('📨 SENDING VERIFICATION EMAIL...');
      
      if (!idToken) {
        reject(new Error('No ID token available'));
        return;
      }

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
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 Email API response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('🎉 ✅ EMAIL VERIFICATION SENT SUCCESSFULLY');
              resolve(parsedData);
            } else {
              reject(new Error(parsedData.error?.message || 'Email sending failed'));
            }
          } catch (error) {
            reject(new Error('Failed to parse email response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Email sending timeout'));
      });

      req.write(emailData);
      req.end();
    });
  }

  async signInFirebaseUser(email, password) {
    return new Promise((resolve, reject) => {
      console.log('🔐 Signing in existing Firebase user:', email);
      
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
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 Firebase signin response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ Firebase sign in SUCCESS - Email verified:', parsedData.emailVerified);
              resolve(parsedData);
            } else {
              reject(new Error(parsedData.error?.message || 'Sign in failed'));
            }
          } catch (error) {
            reject(new Error('Failed to parse sign in response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Sign in timeout'));
      });

      req.write(userData);
      req.end();
    });
  }

  async storeFirebaseUidSimple(userId, firebaseUid) {
    try {
      const result = await pool.query(
        'UPDATE users SET firebase_uid = $1 WHERE id = $2',
        [firebaseUid, userId]
      );
      console.log('✅ Firebase UID stored in database:', firebaseUid);
      return result;
    } catch (error) {
      console.log('❌ Error storing Firebase UID:', error.message);
    }
  }

  // ✅ VERIFY OOB CODE (When user clicks email link)
  async verifyOobCode(oobCode) {
    return new Promise((resolve, reject) => {
      console.log('🔐 Verifying OOB code from email link...');
      
      const verifyData = JSON.stringify({
        oobCode: oobCode
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:update?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(verifyData)
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 OOB verification response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ OOB code verification SUCCESS - Email verified:', parsedData.email);
              resolve({ 
                success: true, 
                email: parsedData.email,
                emailVerified: true 
              });
            } else {
              console.log('❌ OOB code verification FAILED:', parsedData.error);
              resolve({ 
                success: false, 
                error: parsedData.error?.message || 'OOB code verification failed' 
              });
            }
          } catch (error) {
            resolve({ success: false, error: 'Failed to parse OOB verification response' });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: 'Network error: ' + error.message });
      });

      req.on('timeout', () => {
        resolve({ success: false, error: 'OOB verification timeout' });
      });

      req.write(verifyData);
      req.end();
    });
  }

  // ✅ CHECK USER VERIFICATION STATUS
  async checkUserVerification(email, password) {
    try {
      console.log('🔍 Checking verification status for:', email);
      
      const signInResult = await this.signInFirebaseUser(email, password);
      
      if (signInResult && signInResult.emailVerified) {
        console.log('✅ User is verified in Firebase');
        
        // Update database
        await this.updateDatabaseVerification(email);
        
        return {
          success: true,
          emailVerified: true,
          message: 'Email is verified'
        };
      } else {
        return {
          success: true,
          emailVerified: false,
          message: 'Email not verified yet'
        };
      }
    } catch (error) {
      console.log('❌ Error checking verification:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ✅ UPDATE DATABASE VERIFICATION STATUS
  async updateDatabaseVerification(email) {
    try {
      const result = await pool.query(
        'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
        [email]
      );

      if (result.rows.length > 0) {
        console.log('✅ Database verification updated for:', email);
        return { success: true, user: result.rows[0] };
      } else {
        console.log('❌ User not found in database:', email);
        return { success: false, error: 'User not found' };
      }
    } catch (error) {
      console.log('❌ Database update error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Test methods
  async testFirebaseConnection() {
    try {
      const testData = JSON.stringify({
        email: "test@example.com",
        password: "testpassword123",
        returnSecureToken: true
      });

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'identitytoolkit.googleapis.com',
          path: `/v1/accounts:signUp?key=${this.apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(testData)
          },
          timeout: 10000
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
                resolve({ success: true, message: 'Firebase connection successful' });
              } else if (res.statusCode === 400 && parsedData.error?.message?.includes('EMAIL_EXISTS')) {
                resolve({ success: true, message: 'Firebase connection successful' });
              } else {
                resolve({ success: false, error: parsedData.error?.message || 'Firebase connection failed' });
              }
            } catch (error) {
              resolve({ success: false, error: 'Failed to parse Firebase response' });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ success: false, error: 'Network error: ' + error.message });
        });

        req.on('timeout', () => {
          resolve({ success: false, error: 'Firebase connection timeout' });
        });

        req.write(testData);
        req.end();
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new FirebaseEmailService();
