// services/firebase-email-service.js - COMPLETE REVISED WITH SYNC SUPPORT
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
        
        // Step 2: Store Firebase UID in database (simple query)
        console.log('🔄 Step 2: Storing Firebase UID...');
        await this.storeFirebaseUidSimple(userId, userResult.localId);
        
        // Step 3: Send verification email (MAIN FOCUS)
        console.log('🔄 Step 3: Sending verification email...');
        if (userResult.idToken) {
          const emailResult = await this.sendVerificationToUser(userResult.idToken);
          
          if (emailResult && emailResult.email) {
            console.log('🎉 ✅ VERIFICATION EMAIL SENT SUCCESSFULLY TO:', email);
            
            // User created, email sent - set as unverified until they click link
            await pool.query(
              'UPDATE users SET email_verified = false WHERE id = $1',
              [userId]
            );
            
            return { 
              success: true, 
              email: email,
              firebaseUid: userResult.localId,
              message: 'Registration successful! Please check your email for verification link.',
              emailSent: true
            };
          } else {
            console.log('❌ Email sending failed but user created');
          }
        }
        
        // If email failed, still complete registration but mark as unverified
        await pool.query(
          'UPDATE users SET email_verified = false WHERE id = $1',
          [userId]
        );
        
        return { 
          success: true, 
          email: email,
          firebaseUid: userResult.localId,
          message: 'Registration completed but email verification failed. Please use resend verification.',
          emailSent: false
        };
        
      } else {
        console.log('❌ Firebase user creation failed');
        // Still create user in database but unverified
        await pool.query(
          'UPDATE users SET email_verified = false WHERE id = $1',
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
      // On error, still create user but unverified
      try {
        await pool.query(
          'UPDATE users SET email_verified = false WHERE id = $1',
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

      console.log('📡 Making Firebase API request...');
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 Firebase API response status:', res.statusCode);
          console.log('📡 Firebase API response data:', data);
          
          try {
            const parsedData = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log('✅ Firebase user creation SUCCESS');
              resolve(parsedData);
            } else {
              console.log('❌ Firebase user creation FAILED:', parsedData.error);
              
              // If email already exists, try to sign in
              if (parsedData.error && parsedData.error.message && 
                  parsedData.error.message.includes('EMAIL_EXISTS')) {
                console.log('🔄 Email exists, attempting sign in...');
                this.signInFirebaseUser(email, password)
                  .then(resolve)
                  .catch(signInError => {
                    console.log('❌ Sign in failed:', signInError.message);
                    reject(new Error('Email exists but sign in failed'));
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

  async sendVerificationToUser(idToken) {
    return new Promise((resolve, reject) => {
      console.log('📨 SENDING VERIFICATION EMAIL...');
      console.log('📨 Using ID Token:', idToken ? 'Present' : 'Missing');
      
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

      console.log('📡 Making email API request...');
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('📡 Email API response status:', res.statusCode);
          console.log('📡 Email API response data:', data);
          
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
              console.log('✅ Firebase sign in SUCCESS');
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

  // Simple storage without updated_at to avoid database errors
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
      // Don't throw - just log the error
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

  // Test email delivery specifically
  async testEmailDelivery(email) {
    try {
      console.log('🧪 Testing email delivery to:', email);
      
      // Create a temporary user
      const tempPassword = 'test123456';
      const userResult = await this.createFirebaseUser(email, tempPassword);
      
      if (userResult && userResult.idToken) {
        const emailResult = await this.sendVerificationToUser(userResult.idToken);
        return {
          success: true,
          message: 'Test email sent successfully!',
          email: email,
          details: emailResult
        };
      } else {
        return {
          success: false,
          message: 'Failed to create test user'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Test failed: ' + error.message
      };
    }
  }
}

export default new FirebaseEmailService();
