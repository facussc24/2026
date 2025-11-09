// Firebase Configuration
// TODO: Replace with your Firebase project credentials from Firebase Console
// Go to: Firebase Console > Project Settings > General > Your apps > Firebase SDK snippet > Config

const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Collection name for AMFE documents
const COLLECTION_NAME = 'amfes';
