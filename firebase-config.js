window.ZAFRAAN_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBeS-WfVLF1zIVVcZqonYpZ71yDK-XgNMQ",
  authDomain: "zafraan-666ea.firebaseapp.com",
  projectId: "zafraan-666ea",
  storageBucket: "zafraan-666ea.firebasestorage.app",
  messagingSenderId: "502276631276",
  appId: "1:502276631276:web:c70b57be9c7a1de7fed3c9"
};

window.ZAFRAAN_ADMIN_EMAILS = [
  "padhomjs@gmail.com"
];

// Delivery user emails — add the Google accounts of your delivery riders here
window.ZAFRAAN_DELIVERY_EMAILS = [
  "padhomjs@gmail.com"
  // "rider2@gmail.com"
];

// FCM Web Push VAPID key — needed for background push when the delivery app is closed
// How to get it:
//   1. Firebase Console → Project Settings → Cloud Messaging
//   2. Under "Web configuration" → Generate key pair → copy the public key
window.ZAFRAAN_FCM_VAPID_KEY = 'YOUR_VAPID_KEY_HERE';

// FCM Server Key — used by the admin panel to push notifications to delivery phones
// How to get it:
//   Firebase Console → Project Settings → Cloud Messaging → "Cloud Messaging API (Legacy)" → Server key
// Note: keep this file out of public git repos if you add the real key
window.ZAFRAAN_FCM_SERVER_KEY = 'YOUR_FCM_SERVER_KEY_HERE';

// Your UPI ID — replace with your actual UPI ID (e.g. "zafraan@oksbi")
window.ZAFRAAN_UPI_ID = "m.jaffer.s-1@okaxis";

// Razorpay publishable key (KEY_ID only — safe for frontend; KEY_SECRET never goes here)
window.ZAFRAAN_RAZORPAY_KEY_ID = "rzp_live_SwI0qMoU2vDCuj";