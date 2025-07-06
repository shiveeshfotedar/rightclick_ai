// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Your Firebase config (replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyBF-rhFlBk45EApH4iYC4nd9UJXiODrs9w",
  authDomain: "ai-context-assistant-1336e.firebaseapp.com",
  projectId: "ai-context-assistant-1336e",
  storageBucket: "ai-context-assistant-1336e.firebasestorage.app",
  messagingSenderId: "367265109489",
  appId: "1:367265109489:web:c98727f4f99945be622050",
  measurementId: "G-3D2DTKHBF7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Auth Functions
export const authFunctions = {
  // Sign up with email/password
  signUp: async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sign in with email/password
  signIn: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChange: (callback) => {
    return onAuthStateChanged(auth, callback);
  }
};

// Database Functions
export const dbFunctions = {
  // Save conversation
  saveConversation: async (conversationData) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const docRef = await addDoc(collection(db, 'conversations'), {
        userId: user.uid,
        ...conversationData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update conversation
  updateConversation: async (conversationId, updateData) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const conversationRef = doc(db, 'conversations', conversationId);
      await updateDoc(conversationRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user conversations
  getUserConversations: async (limitCount = 50) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const q = query(
        collection(db, 'conversations'),
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const conversations = [];
      
      querySnapshot.forEach((doc) => {
        conversations.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return { success: true, conversations };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Delete conversation
  deleteConversation: async (conversationId) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      await deleteDoc(doc(db, 'conversations', conversationId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Save user settings (including encrypted API key)
  saveUserSettings: async (settings) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        settings: settings,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      // If user document doesn't exist, create it
      try {
        await addDoc(collection(db, 'users'), {
          userId: user.uid,
          email: user.email,
          settings: settings,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { success: true };
      } catch (createError) {
        return { success: false, error: createError.message };
      }
    }
  },

  // Get user settings
  getUserSettings: async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const q = query(
        collection(db, 'users'),
        where('userId', '==', user.uid)
      );

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return { success: true, settings: null };
      }

      const userDoc = querySnapshot.docs[0];
      return { success: true, settings: userDoc.data().settings || {} };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Utility Functions
export const utils = {
  // Simple encryption for API key (you might want to use a more robust solution)
  encryptApiKey: (apiKey) => {
    return btoa(apiKey + 'ai-context-salt'); // Basic encoding
  },

  // Simple decryption for API key
  decryptApiKey: (encryptedKey) => {
    try {
      const decoded = atob(encryptedKey);
      return decoded.replace('ai-context-salt', '');
    } catch (error) {
      return null;
    }
  },

  // Format conversation for saving
  formatConversationForSave: (bubble) => {
    return {
      conversation: bubble.conversation,
      pageUrl: window.location.href,
      pageTitle: document.title,
      coordinates: { x: bubble.x, y: bubble.y },
      domain: window.location.hostname,
      conversationSummary: bubble.conversation[0]?.content?.substring(0, 100) + '...' || 'Conversation'
    };
  },

  // Format timestamp for display
  formatTimestamp: (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }
};

// Export auth state
export { auth as firebaseAuth };