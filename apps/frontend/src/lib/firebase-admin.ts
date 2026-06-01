import firebaseAdmin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!firebaseAdmin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    // Initialize without credentials — Firestore calls will fail gracefully
    firebaseAdmin.initializeApp({ projectId: projectId || 'aurix-placeholder' });
    console.warn('Firebase Admin: missing credentials, Firestore writes will fail');
  }
}

export const db = firebaseAdmin.firestore();
