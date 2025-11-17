// services/firebase-email-service.js
import https from 'https';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email, password) {
    return new Promise((resolve, reject) => {
      console.log('📧 Starting email verification process for:', email);
      
      // Step 1: Create a temporary Firebase user
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
            
            if (res.statusCode === 200 && parsedData.idToken) {
              console.log('✅ Firebase user created for:', email);
              // Step 2: Send verification email
              this.sendVerificationToUser(parsedData.idToken, email)
                .then(resolve)
                .catch(error => {
                  console.log('⚠️ Verification email failed but continuing:', error.message);
                  resolve({}); // Don't break registration
                });
            } else {
              console.log('❌ Firebase user creation failed:', parsedData.error?.message);
              resolve({}); // Don't break registration
            }
          } catch (error) {
            console.log('⚠️ JSON parse error, but continuing registration');
            resolve({});
          }
        });
      });

      req.on('error', (error) => {
        console.log('⚠️ Firebase service offline, but registration continues');
        resolve({});
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
              console.log('✅ Firebase verification email sent to:', email);
              resolve(parsedData);
            } else {
              console.log('❌ Email sending failed:', parsedData.error?.message);
              resolve(parsedData);
            }
          } catch (error) {
            console.log('⚠️ Email response parse error');
            resolve({});
          }
        });
      });

      req.on('error', (error) => {
        console.log('⚠️ Email sending failed, but registration successful');
        resolve({});
      });

      req.write(emailData);
      req.end();
    });
  }
}

export default new FirebaseEmailService();
