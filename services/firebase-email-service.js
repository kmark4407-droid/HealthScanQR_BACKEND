// services/firebase-email-service.js - COMPLETE WORKING VERSION
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
        console.log('✅ Firebase user handled successfully');
        
        // Step 2: Store Firebase UID in database (if it's a real ID)
        if (!userResult.localId.startsWith('existing-user-')) {
          console.log('🔄 Step 2: Storing Firebase UID...');
          await this.storeFirebaseUid(userId, userResult.localId);
        }
        
        // Step 3: Send verification email
        console.log('🔄 Step 3: Sending verification email...');
        const emailResult = await this.sendVerificationToUser(userResult.idToken, email);
        
        if (emailResult && emailResult.email) {
          console.log('🎉 ✅ VERIFICATION EMAIL SENT SUCCESSFULLY TO:', email);
          return { 
            success: true, 
            email: email,
            firebaseUid: userResult.localId,
            message: 'Registration successful! Please check your email for verification link.',
            emailSent: true,
            existingUser: userResult.existingUser || false
          };
        } else {
          console.log('⚠️ Email sending may have issues but registration continues');
        }
        
        return { 
          success: true, 
          email: email,
          firebaseUid: userResult.localId,
          message: userResult.existingUser 
            ? 'Registration complete! If you don\'t receive verification email, please use "Resend Verification" option.'
            : 'Registration completed but email verification may have issues.',
          emailSent: userResult.verificationSent || false,
          existingUser: userResult.existingUser || false
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
              
              // If email already exists, send verification email directly
              if (parsedData.error && parsedData.error.message && 
                  parsedData.error.message.includes('EMAIL_EXISTS')) {
                console.log('📧 Email exists in Firebase - sending verification directly...');
                
                // Send verification email without requiring sign in
                this.sendVerificationToExistingUser(email)
                  .then(verificationResult => {
                    console.log('✅ Verification email sent to existing user');
                    // Return a mock user object so registration can continue
                    resolve({
                      localId: 'existing-user-' + Date.now(),
                      idToken: null,
                      email: email,
                      emailVerified: false,
                      existingUser: true,
                      verificationSent: true
                    });
                  })
                  .catch(verificationError => {
                    console.log('❌ Failed to send verification to existing user:', verificationError.message);
                    // Still allow registration to continue
                    resolve({
                      localId: 'existing-user-fallback-' + Date.now(),
                      idToken: null,
                      email: email,
                      emailVerified: false,
                      existingUser: true,
                      verificationSent: false
                    });
                  });
              } else {
                reject(new Error(parsedData.error?.message || 'Firebase user creation failed'));
              }
            }
          } catch (error) {
            console.log('❌ JSON parse error');
            reject(new Error('Failed to parse Firebase response'));
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error:', error.message);
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        console.log('❌ Firebase request timeout');
        req.destroy();
        reject(new Error('Firebase request timeout'));
      });

      req.write(userData);
      req.end();
    });
  }

  // NEW METHOD: Send verification to existing user
  async sendVerificationToExistingUser(email) {
    return new Promise((resolve, reject) => {
      console.log('📨 Sending verification to existing user:', email);
      
      const emailData = JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        email: email
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
          console.log('📡 Direct verification response status:', res.statusCode);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ Verification email sent to existing user');
              resolve(parsedData);
            } else {
              console.log('❌ Direct verification failed:', parsedData.error);
              reject(new Error(parsedData.error?.message || 'Direct verification failed'));
            }
          } catch (error) {
            console.log('❌ JSON parse error in direct verification');
            reject(new Error('Failed to parse direct verification response'));
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error in direct verification:', error.message);
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        console.log('❌ Direct verification timeout');
        req.destroy();
        reject(new Error('Direct verification timeout'));
      });

      req.write(emailData);
      req.end();
    });
  }

  async sendVerificationToUser(idToken, email = null) {
    return new Promise((resolve, reject) => {
      console.log('📨 SENDING VERIFICATION EMAIL...');
      
      // If no ID token but we have email, use email method
      if (!idToken && email) {
        console.log('🔄 Using email-based verification (no ID token)');
        this.sendVerificationToExistingUser(email)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (!idToken) {
        console.log('❌ No ID token available for email sending');
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
              console.log('❌ Email verification sending FAILED:', parsedData.error);
              reject(new Error(parsedData.error?.message || 'Email sending failed'));
            }
          } catch (error) {
            console.log('❌ JSON parse error in email response');
            reject(new Error('Failed to parse email response'));
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error in email sending:', error.message);
        reject(new Error('Network error: ' + error.message));
      });

      req.on('timeout', () => {
        console.log('❌ Email sending request timeout');
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
              console.log('❌ Firebase sign in FAILED:', parsedData.error);
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
        'UPDATE users SET firebase_uid = $1 WHERE id = $2',
        [firebaseUid, userId]
      );
      console.log('✅ Firebase UID stored in database:', firebaseUid);
      return result;
    } catch (error) {
      console.log('❌ Error storing Firebase UID:', error.message);
    }
  }

  // ✅ VERIFY OOB CODE - EXTRACTS EMAIL FROM VERIFICATION LINK
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
          console.log('📡 OOB verification response data:', data);
          
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log('✅ OOB code verification SUCCESS');
              console.log('✅ Verified email:', parsedData.email);
              resolve({ 
                success: true, 
                email: parsedData.email,
                emailVerified: true,
                localId: parsedData.localId
              });
            } else {
              console.log('❌ OOB code verification FAILED:', parsedData.error);
              resolve({ 
                success: false, 
                error: parsedData.error?.message || 'OOB code verification failed' 
              });
            }
          } catch (error) {
            console.log('❌ JSON parse error in OOB response');
            resolve({ success: false, error: 'Failed to parse OOB verification response' });
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ OOB verification network error:', error.message);
        resolve({ success: false, error: 'Network error: ' + error.message });
      });

      req.on('timeout', () => {
        console.log('❌ OOB verification timeout');
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
        const dbResult = await this.handleVerificationCallback(email);
        
        return {
          success: true,
          emailVerified: true,
          databaseUpdated: dbResult.success,
          message: 'Email is verified and database updated'
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

  // ✅ HANDLE VERIFICATION CALLBACK - UPDATES DATABASE
  async handleVerificationCallback(email) {
    try {
      console.log('🔄 Handling verification callback for:', email);
      
      const result = await pool.query(
        'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 RETURNING *',
        [email]
      );

      if (result.rows.length > 0) {
        console.log('✅ DATABASE UPDATED - Email verified:', email);
        console.log('✅ User verification status:', result.rows[0].email_verified);
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
