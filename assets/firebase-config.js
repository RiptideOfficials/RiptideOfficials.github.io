// ---------------------------------------------------------------
// Riptide Officials: site settings
//
// 1) Create a free Firebase project (see README.md, step by step).
// 2) Paste your project's web app config below, replacing the
//    PASTE_... values. These values are safe to be public; the
//    Firestore security rules (firestore.rules) are what protect data.
// ---------------------------------------------------------------
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyA1lEaKRrci_uQ6uVFZMAUBbdoqsHMcDpA",
  authDomain: "riptideofficials.firebaseapp.com",
  projectId: "riptideofficials",
  storageBucket: "riptideofficials.firebasestorage.app",
  messagingSenderId: "1049001251502",
  appId: "1:1049001251502:web:9c14378a7accf859f9133f"
};

// The admin account. Must match the email in firestore.rules.
window.ADMIN_EMAIL = "whpeterson@gmail.com";

// Where "Interested in becoming an official?" form submissions go.
window.INTEREST_FORM_EMAIL = "whpeterson@gmail.com";

// FormSubmit form ID (from the activation email). Used instead of the email address in the page code.
window.FORMSUBMIT_ID = "2d67ff7d56be47cc6a6cbe6d7a687e0f";
