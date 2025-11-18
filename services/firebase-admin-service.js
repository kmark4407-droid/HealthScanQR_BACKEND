// services/firebase-admin-service.js
import admin from 'firebase-admin';

// Initialize Firebase Admin
try {
  if (!admin.apps.length) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com"
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
}

// Delete Firebase user function
export const deleteFirebaseUser = async (firebaseUid) => {
  try {
    if (!firebaseUid) {
      console.log('ℹ️ No Firebase UID provided for deletion');
      return { success: true, message: 'No Firebase UID provided' };
    }

    console.log('🔥 Deleting Firebase user:', firebaseUid);
    await admin.auth().deleteUser(firebaseUid);
    
    console.log('✅ Firebase user deleted successfully:', firebaseUid);
    return { success: true, message: 'Firebase user deleted successfully' };
    
  } catch (error) {
    console.error('❌ Firebase Admin deletion error:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log('ℹ️ Firebase user already deleted');
      return { success: true, message: 'Firebase user already deleted' };
    }
    
    return { success: false, error: error.message };
  }
};

export default admin;
