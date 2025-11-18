// services/firebase-email-service.js - FIXED VERSION
import https from 'https';
import pool from '../db.js';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email, password, userId) {
    try {
      console.log('📧 Starting email verification process for:', email);
      
      // Step 1: Create Firebase user (with retry logic)
      console.log('🔄 Step 1: Creating Firebase user...');
      const userResult = await this.createFirebaseUserWithRetry(email, password);
      
      if (userResult && userResult.localId) {
        console.log('✅ Firebase user created successfully');
        
        // Step 2: Store Firebase UID in database
        console.log('🔄 Step 2: Storing Firebase UID in database...');
        await this.storeFirebaseUid(userId, userResult.localId);
        
        // Step 3: Send verification email with retry logic
        console.log('🔄 Step 3: Sending verification email...');
        let emailSent = false;
        let emailError = null;
        
        if (userResult.idToken) {
          try {
            const emailResult = await this.sendVerificationToUserWithRetry(userResult.idToken);
            if (emailResult && emailResult.email) {
              console.log('✅ Verification email sent successfully to:', email);
              emailSent = true;
            }
          } catch (emailErr) {
            emailError = emailErr.message;
            console.log('⚠️ Email sending failed:', emailError);
          }
        }

        // Step 4: Set verification status based on email success
        console.log('🔄 Step 4: Setting verification status...');
        const verifiedStatus = emailSent; // Only verify if email was sent
        await pool.query(
          'UPDATE users SET email_verified = $1, updated_at = NOW() WHERE id = $2',
          [verifiedStatus, userId]
        );

        if (emailSent) {
          return { 
            success: true, 
            email: email,
            firebaseUid: userResult.localId,
            message: 'User registered successfully! Please check your email for verification.',
            emailSent: true
          };
        } else {
          return { 
            success: true, 
            email: email,
            firebaseUid: userResult.localId,
            message: 'User registered but email verification failed. Please use resend verification.',
            emailSent: false,
            error: emailError
          };
        }
      } else {
        console.log('❌ Firebase user creation failed');
        // Create user in database only
        await pool.query(
          'UPDATE users SET email_verified = false, updated_at = NOW() WHERE id = $1',
          [userId]
        );
        
        return { 
          success: false, 
          error: 'Firebase user creation failed',
          message: 'Registration completed but email verification unavailable.'
        };
      }
    } catch (error) {
      console.log('❌ Email service error:', error.message);
      // Set as unverified on error
      try {
        await pool.query(
          'UPDATE users SET email_verified = false, updated_at = NOW() WHERE id = $1',
          [userId]
        );
      } catch (dbError) {
        console.log('⚠️ Database update error:', dbError.message);
      }
      
      return { 
        success: false, 
        error: error.message,
        message: 'Registration failed due to server error.'
      };
    }
  }

  async createFirebaseUserWithRetry(email, password, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Firebase user creation attempt ${attempt}/${retries}`);
        const result = await this.createFirebaseUser(email, password);
        if (result) return result;
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await this.delay(1000 * attempt); // Exponential backoff
      }
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
              console.log('❌ Firebase user creation FAILED:', parsedData.error?.message);
              
              // If email exists, try to sign in
              if (parsedData.error?.message?.includes('EMAIL_EXISTS')) {
                console.log('🔄 Email exists, attempting sign in...');
                this.signInFirebaseUser(email, password)
                  .then(resolve)
                  .catch(signInError => {
                    reject(new Error('Email exists but sign in failed: ' + signInError.message));
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

  async sendVerificationToUserWithRetry(idToken, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Email sending attempt ${attempt}/${retries}`);
        const result = await this.sendVerificationToUser(idToken);
        if (result) return result;
      } catch (error) {
        console.log(`❌ Email attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await this.delay(1000 * attempt);
      }
    }
  }

  async sendVerificationToUser(idToken) {
    return new Promise((resolve, reject) => {
      console.log('📨 Sending verification email...');
      
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
          console.log('📡 Email sending response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ Email verification sent SUCCESSFULLY');
              resolve(parsedData);
            } else {
              console.log('❌ Email verification sending FAILED:', parsedData.error?.message);
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
              console.log('✅ Firebase sign in SUCCESS');
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

  async storeFirebaseUid(userId, firebaseUid) {
    try {
      const result = await pool.query(
        'UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [firebaseUid, userId]
      );
      console.log('✅ Firebase UID stored in database:', firebaseUid);
      return result;
    } catch (error) {
      console.log('❌ Error storing Firebase UID:', error.message);
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test Firebase connection
  async testFirebaseConnection() {
    try {
      console.log('🧪 Testing Firebase connection...');
      
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
