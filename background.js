// background.js - Chrome Extension Service Worker
console.log('AI Context Assistant background script loaded');

// Global state
let currentUser = null;
let userSettings = {};

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Open welcome page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/popup.html')
    });
  }
  
  // Create context menu
  chrome.contextMenus.create({
    id: 'aiContextAssistant',
    title: 'Ask AI about this',
    contexts: ['selection', 'page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'aiContextAssistant') {
    // Send message to content script to trigger AI assistant
    chrome.tabs.sendMessage(tab.id, {
      action: 'triggerAI',
      selectedText: info.selectionText || '',
      pageUrl: info.pageUrl
    }).catch(() => {
      // Ignore errors for tabs that don't have content script
      console.log('Content script not available on this tab');
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'saveConversation':
      handleSaveConversation(request.data).then(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'getApiKey':
      handleGetApiKey().then(sendResponse);
      return true;
      
    case 'getUserSettings':
      handleGetUserSettings().then(sendResponse);
      return true;
      
    case 'checkAuthState':
      handleCheckAuthState().then(sendResponse);
      return true;
      
    case 'makeOpenAIRequest':
      handleOpenAIRequest(request.data).then(sendResponse);
      return true;
      
    case 'getUserConversations':
      handleGetUserConversations(request.limit || 50).then(sendResponse);
      return true;
      
    case 'signOut':
      handleSignOut().then(sendResponse);
      return true;
      
    case 'exportData':
      handleExportData().then(sendResponse);
      return true;
      
    case 'openAuthPage':
      chrome.tabs.create({
        url: chrome.runtime.getURL('popup/popup.html')
      });
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Import Firebase functions dynamically (for service worker compatibility)
async function getFirebaseModules() {
  try {
    // Import Firebase configuration
    const firebaseModule = await import(chrome.runtime.getURL('firebase-config.js'));
    return firebaseModule;
  } catch (error) {
    console.error('Error importing Firebase modules:', error);
    throw new Error('Firebase not available');
  }
}

// Save conversation to Firebase
async function handleSaveConversation(conversationData) {
  try {
    const { authFunctions, dbFunctions, utils } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Format conversation data
    const formattedData = {
      conversation: conversationData.conversation,
      pageUrl: conversationData.pageUrl,
      pageTitle: conversationData.pageTitle,
      coordinates: conversationData.coordinates,
      domain: conversationData.domain,
      conversationSummary: conversationData.conversation[0]?.content?.substring(0, 100) + '...' || 'Conversation'
    };
    
    // Save to Firestore
    const result = await dbFunctions.saveConversation(formattedData);
    
    if (result.success) {
      console.log('Conversation saved:', result.id);
      
      // Update badge to show saved conversations count
      updateBadge();
      
      return { success: true, id: result.id };
    } else {
      console.error('Failed to save conversation:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error in handleSaveConversation:', error);
    return { success: false, error: error.message };
  }
}

// Get API key from user settings
async function handleGetApiKey() {
  try {
    const { authFunctions, dbFunctions, utils } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get user settings
    const result = await dbFunctions.getUserSettings();
    
    if (result.success && result.settings && result.settings.encryptedApiKey) {
      const apiKey = utils.decryptApiKey(result.settings.encryptedApiKey);
      return { success: true, apiKey: apiKey };
    } else {
      return { success: false, error: 'No API key found' };
    }
  } catch (error) {
    console.error('Error getting API key:', error);
    return { success: false, error: error.message };
  }
}

// Get user settings
async function handleGetUserSettings() {
  try {
    const { authFunctions, dbFunctions } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const result = await dbFunctions.getUserSettings();
    
    if (result.success) {
      userSettings = result.settings || {};
      return { success: true, settings: userSettings };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error getting user settings:', error);
    return { success: false, error: error.message };
  }
}

// Check authentication state
async function handleCheckAuthState() {
  try {
    const { authFunctions } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    
    if (user) {
      currentUser = user;
      return { 
        success: true, 
        authenticated: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        }
      };
    } else {
      return { success: true, authenticated: false };
    }
  } catch (error) {
    console.error('Error checking auth state:', error);
    return { success: false, error: error.message };
  }
}

// Make OpenAI API request with user's API key
async function handleOpenAIRequest(requestData) {
  try {
    const { messages, model = 'gpt-4o', maxTokens = 500 } = requestData;
    
    // Get API key
    const apiKeyResult = await handleGetApiKey();
    if (!apiKeyResult.success) {
      throw new Error('No API key available. Please add your OpenAI API key in settings.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyResult.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return { 
      success: true, 
      response: data.choices[0].message.content 
    };
    
  } catch (error) {
    console.error('Error making OpenAI request:', error);
    return { success: false, error: error.message };
  }
}

// Get user conversations
async function handleGetUserConversations(limit = 50) {
  try {
    const { authFunctions, dbFunctions } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const result = await dbFunctions.getUserConversations(limit);
    
    if (result.success) {
      return { success: true, conversations: result.conversations };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error getting conversations:', error);
    return { success: false, error: error.message };
  }
}

// Sign out user
async function handleSignOut() {
  try {
    const { authFunctions } = await getFirebaseModules();
    
    const result = await authFunctions.signOut();
    
    if (result.success) {
      currentUser = null;
      userSettings = {};
      
      // Clear badge
      chrome.action.setBadgeText({ text: '' });
      
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error signing out:', error);
    return { success: false, error: error.message };
  }
}

// Export user data
async function handleExportData() {
  try {
    const { authFunctions } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get all conversations
    const conversationsResult = await handleGetUserConversations(1000);
    const settingsResult = await handleGetUserSettings();

    if (conversationsResult.success && settingsResult.success) {
      const exportData = {
        user: {
          email: user.email,
          displayName: user.displayName,
          uid: user.uid
        },
        conversations: conversationsResult.conversations,
        settings: settingsResult.settings,
        exportDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
      };

      return { success: true, data: exportData };
    } else {
      return { success: false, error: 'Failed to gather export data' };
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    return { success: false, error: error.message };
  }
}

// Update extension badge with conversation count
async function updateBadge() {
  try {
    const { authFunctions } = await getFirebaseModules();
    
    const user = authFunctions.getCurrentUser();
    if (!user) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    // Get recent conversations count
    const result = await handleGetUserConversations(10);
    
    if (result.success) {
      const count = result.conversations.length;
      chrome.action.setBadgeText({ 
        text: count > 0 ? count.toString() : '' 
      });
      chrome.action.setBadgeBackgroundColor({ color: '#0064e1' });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Initialize Firebase auth listener when extension starts
chrome.runtime.onStartup.addListener(async () => {
  try {
    const { authFunctions } = await getFirebaseModules();
    
    authFunctions.onAuthStateChange((user) => {
      currentUser = user;
      updateBadge();
      
      // Notify content scripts about auth state change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'authStateChanged',
            user: user ? {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName
            } : null
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        });
      });
    });
  } catch (error) {
    console.error('Error setting up auth listener:', error);
  }
});

// Storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('Storage changed:', changes, namespace);
});

// Alarm for periodic cleanup (optional)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    performCleanup();
  }
});

// Set up periodic cleanup (24 hours)
chrome.alarms.create('cleanup', { 
  delayInMinutes: 1440, // 24 hours
  periodInMinutes: 1440 
});

// Perform cleanup of old conversations
async function performCleanup() {
  try {
    // Clean up old conversations based on user settings
    const settingsResult = await handleGetUserSettings();
    
    if (settingsResult.success && settingsResult.settings.maxHistory > 0) {
      const { dbFunctions } = await getFirebaseModules();
      
      // Get all conversations
      const result = await handleGetUserConversations(1000);
      
      if (result.success && result.conversations.length > settingsResult.settings.maxHistory) {
        // Delete oldest conversations
        const conversationsToDelete = result.conversations
          .slice(settingsResult.settings.maxHistory)
          .map(conv => conv.id);
        
        for (const id of conversationsToDelete) {
          await dbFunctions.deleteConversation(id);
        }
        
        console.log(`Cleaned up ${conversationsToDelete.length} old conversations`);
        updateBadge();
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Handle extension unload
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending...');
});

// Handle tab updates (optional - for context awareness)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Could be used for analytics or context awareness
    // console.log('Tab updated:', tab.url);
  }
});

// Handle extension errors
chrome.runtime.onError?.addListener?.((error) => {
  console.error('Extension error:', error);
});