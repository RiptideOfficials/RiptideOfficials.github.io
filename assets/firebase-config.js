// ---------------------------------------------------------------
// Riptide Officials: site settings
//
// 1) Create a free Firebase project (see README.md, step by step).
// 2) Paste your project's web app config below, replacing the
//    PASTE_... values. These values are safe to be public; the
//    Firestore security rules (firestore.rules) are what protect data.
// ---------------------------------------------------------------
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// The admin account. Must match the email in firestore.rules.
window.ADMIN_EMAIL = "whpeterson@gmail.com";

// Where "Interested in becoming an official?" form submissions go.
window.INTEREST_FORM_EMAIL = "whpeterson@gmail.com";
