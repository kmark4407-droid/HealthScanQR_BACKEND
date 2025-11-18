// services/firebase-email-service.js - FIXED VERSION WITH PROPER POLLING
import https from 'https';
import pool from '../db.js';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
    this.pollingIntervals = new Map(); // Track polling per user
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
          
          // Start verification polling immediately
          this.startVerificationPolling(email, userResult.localId, userId);
          
          return { 
            success: true, 
            email: emailResult.email, 
            firebaseUid: userResult.localId,
            message: 'Check your email and click the verification link'
          };
        } else {
          console.log('❌ Email sending failed');
          return { 
            success: false, 
            error: 'Email sending failed',
            message: 'Use /api/auth/super-verify to verify manually'
          };
        }
      } else {
        console.log('❌ Firebase user creation failed');
        return { 
          success: false, 
          error: 'User creation failed',
          message: 'Use /api/auth/super-verify to verify manually'
        };
      }
    } catch (error) {
      console.log('⚠️ Email service error:', error.message);
      return { 
        success: false, 
        error: error.message,
        message: 'Use /api/auth/super-verify to verify manually'
      };
    }
  }

  async startVerificationPolling(email, firebaseUid, userId) {
    console.log('🔄 Starting verification polling for:', email);
    
    // Clear any existing polling for this user
    if (this.pollingIntervals.has(email)) {
      clearInterval(this.pollingIntervals.get(email));
    }
    
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes total (10s * 60)
    
    const intervalId = setInterval(async () => {
      attempts++;
      
      try {
        console.log(`🔍 Verification check attempt ${attempts} for:`, email);
        
        // Check if email is verified in Firebase
        const isVerified = await this.checkFirebaseVerification(firebaseUid);
        
        if (isVerified) {
          console.log('🎉 Email verified in Firebase! Updating database for:', email);
          
          // Update database - THIS IS THE CRITICAL PART
          const updateResult = await pool.query(
            'UPDATE users SET email_verified = true, updated_at = NOW() WHERE firebase_uid = $1 RETURNING *',
            [firebaseUid]
          );
          
          if (updateResult.rows.length > 0) {
            console.log('✅ Database updated successfully for:', email);
            
            // Log the successful verification
            await pool.query(
              `INSERT INTO activity_logs (action, description, admin_id, admin_name, timestamp)
               VALUES ($1, $2, $3, $4, NOW())`,
              ['EMAIL_VERIFIED', `User verified email: ${email}`, 1, 'System']
            );
          } else {
            console.log('❌ Database update failed for:', email);
          }
          
          clearInterval(intervalId);
          this.pollingIntervals.delete(email);
          return;
        } else {
          console.log('⏳ Email not verified yet in Firebase for:', email);
        }
        
        // Stop after max attempts (10 minutes)
        if (attempts >= maxAttempts) {
          console.log('⏰ Verification polling timeout for:', email);
          clearInterval(intervalId);
          this.pollingIntervals.delete(email);
          
          // Log timeout
          await pool.query(
            `INSERT INTO activity_logs (action, description, admin_id, admin_name, timestamp)
             VALUES ($1, $2, $3, $4, NOW())`,
            ['VERIFICATION_TIMEOUT', `Verification timeout for: ${email}`, 1, 'System']
          );
        }
      } catch (error) {
        console.log('⚠️ Verification check failed:', error.message);
        
        // Stop on error after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          this.pollingIntervals.delete(email);
        }
      }
    }, 10000); // Check every 10 seconds

    // Store the interval ID for cleanup
    this.pollingIntervals.set(email, intervalId);
  }

  async checkFirebaseVerification(firebaseUid) {
    return new Promise((resolve, reject) => {
      if (!firebaseUid) {
        console.log('❌ No Firebase UID provided for verification check');
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
            console.log('📡 Firebase API Response:', {
              statusCode: res.statusCode,
              usersCount: parsedData.users ? parsedData.users.length : 0
            });

            if (res.statusCode === 200 && parsedData.users && parsedData.users.length > 0) {
              const user = parsedData.users[0];
              const isVerified = user.emailVerified || false;
              console.log('🔍 Firebase verification status for', user.email, ':', isVerified);
              resolve(isVerified);
            } else {
              console.log('❌ Firebase verification check failed - API error:', parsedData.error);
              resolve(false);
            }
          } catch (error) {
            console.log('❌ JSON parse error in verification check:', error.message);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Verification check network error:', error.message);
        resolve(false);
      });

      req.setTimeout(10000, () => {
        console.log('❌ Verification check timeout');
        req.destroy();
        resolve(false);
      });

      req.write(userData);
      req.end();
    });
  }

  async storeFirebaseUid(userId, firebaseUid) {
    try {
      const result = await pool.query(
        'UPDATE users SET firebase_uid = $1 WHERE id = $2 RETURNING *',
        [firebaseUid, userId]
      );
      console.log('✅ Firebase UID stored for user:', userId, 'UID:', firebaseUid);
      return result;
    } catch (error) {
      console.log('❌ Error storing Firebase UID:', error.message);
      throw error;
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
            console.log('📡 Firebase SignUp Response:', {
              statusCode: res.statusCode,
              email: parsedData.email,
              localId: parsedData.localId
            });

            if (res.statusCode === 200) {
              console.log('✅ Firebase user created:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Firebase user creation failed:', parsedData.error?.message);
              
              if (parsedData.error?.message?.includes('EMAIL_EXISTS')) {
                console.log('🔄 User exists, signing in...');
                this.signInFirebaseUser(email, password).then(resolve).catch(reject);
              } else {
                reject(new Error(parsedData.error?.message || 'Firebase user creation failed'));
              }
            }
          } catch (error) {
            console.log('❌ JSON parse error in user creation');
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error in user creation');
        reject(error);
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
              reject(new Error(parsedData.error?.message || 'Firebase sign in failed'));
            }
          } catch (error) {
            console.log('❌ JSON parse error in sign in');
            reject(error);
          }
        });
      });

      req.on('error', (error) {
        console.log('❌ Network error in sign in');
        reject(error);
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
              console.log('❌ Email verification failed:', parsedData.error?.message);
              reject(new Error(parsedData.error?.message || 'Email verification failed'));
            }
          } catch (error) {
            console.log('❌ JSON parse error in email sending');
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Network error in email sending');
        reject(error);
      });

      req.write(emailData);
      req.end();
    });
  }

  // NEW METHOD: Force verify by Firebase UID
  async forceVerifyByFirebaseUid(firebaseUid) {
    try {
      console.log('🔧 Force verifying Firebase UID:', firebaseUid);
      
      const isVerified = await this.checkFirebaseVerification(firebaseUid);
      
      if (isVerified) {
        const result = await pool.query(
          'UPDATE users SET email_verified = true, updated_at = NOW() WHERE firebase_uid = $1 RETURNING *',
          [firebaseUid]
        );
        
        if (result.rows.length > 0) {
          console.log('✅ Force verification successful for Firebase UID:', firebaseUid);
          return { 
            success: true, 
            message: 'User verified successfully',
            user: result.rows[0] 
          };
        } else {
          console.log('❌ No user found with Firebase UID:', firebaseUid);
          return { success: false, message: 'User not found' };
        }
      } else {
        console.log('❌ User not verified in Firebase:', firebaseUid);
        return { success: false, message: 'User not verified in Firebase' };
      }
    } catch (error) {
      console.log('❌ Force verification error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // NEW METHOD: Manual verification sync for specific user
  async manualSyncUserVerification(email) {
    try {
      console.log('🔧 Manual sync for user:', email);
      
      // Get user from database
      const userResult = await pool.query(
        'SELECT id, email, firebase_uid FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found' };
      }

      const user = userResult.rows[0];
      
      if (!user.firebase_uid) {
        return { success: false, message: 'No Firebase UID found for user' };
      }

      const isVerified = await this.checkFirebaseVerification(user.firebase_uid);
      
      if (isVerified) {
        const updateResult = await pool.query(
          'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1 RETURNING *',
          [user.id]
        );
        
        console.log('✅ Manual sync successful for:', email);
        return { 
          success: true, 
          message: 'User verified successfully',
          user: updateResult.rows[0] 
        };
      } else {
        return { success: false, message: 'User not verified in Firebase' };
      }
    } catch (error) {
      console.log('❌ Manual sync error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new FirebaseEmailService();
