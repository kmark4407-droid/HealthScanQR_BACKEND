// services/firebase-email-service.js
import https from 'https';

class FirebaseEmailService {
  constructor() {
    this.apiKey = "AIzaSyCeGq_CvoU_dT0PAEhBke-FUQqzsSAhvf4";
  }

  async sendVerificationEmail(email) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        email: email
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:sendOobCode?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
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
              console.log('❌ Firebase email error:', parsedData.error?.message);
              resolve(parsedData); // Don't break registration
            }
          } catch (error) {
            resolve({}); // Don't break registration
          }
        });
      });

      req.on('error', (error) => {
        console.log('⚠️ Firebase email service offline, but registration continues');
        resolve({}); // Don't reject - registration should still work
      });

      req.write(postData);
      req.end();
    });
  }
}

export default new FirebaseEmailService();
