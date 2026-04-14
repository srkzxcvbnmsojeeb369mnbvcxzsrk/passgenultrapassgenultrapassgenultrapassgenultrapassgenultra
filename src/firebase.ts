import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const signInWithGoogle = () => {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '395057172046-756phkra6k1j091467n3ji9jbjlkcruc.apps.googleusercontent.com';
    
    if (!clientId) {
      alert('Google Client ID is missing!');
      return reject(new Error('Missing Client ID'));
    }

    const doAuth = () => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
          callback: (response: any) => {
            if (response.error) {
              alert('Google Sign-In Error: ' + response.error);
              reject(new Error(response.error));
              return;
            }
            
            // Save the access token for Google Drive
            localStorage.setItem('drive_access_token', response.access_token);
            window.dispatchEvent(new CustomEvent('drive_token_received'));
            
            // Sign in to Firebase using the access token
            const credential = GoogleAuthProvider.credential(null, response.access_token);
            signInWithCredential(auth, credential)
              .then(resolve)
              .catch((err) => {
                alert('Firebase Auth Error: ' + err.message);
                reject(err);
              });
          }
        });
        client.requestAccessToken();
      } catch (error: any) {
        alert('Auth Init Error: ' + error.message);
        reject(error);
      }
    };

    if (!window.google?.accounts) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = doAuth;
      script.onerror = () => {
        alert('Failed to load Google Identity Services. Please check your internet connection.');
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.body.appendChild(script);
    } else {
      doAuth();
    }
  });
};

export const logout = () => {
  localStorage.removeItem('drive_access_token');
  return signOut(auth);
};
