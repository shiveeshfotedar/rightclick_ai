// content-script.js - Chrome Extension Content Script
console.log('AI Context Assistant content script loaded');

// Global variables to store screenshot data
let screenshotDataURL = null;
let isSelecting = false;
let startX, startY;
let selectionBox = null;

// Store the element under the right click
let lastRightClickedElement = null;
let lastRightClickX = 0;
let lastRightClickY = 0;

// Store the currently inspected element
let inspectedElement = null;

// NEW: Store AI response bubbles
let responseBubbles = [];
let bubbleCounter = 0;
let activeConversationPanel = null;
let currentUser = null;
let userSettings = {};
let isAuthChecked = false;

// Configuration
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Get device pixel ratio
const dpr = window.devicePixelRatio || 1;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  // Check authentication state first
  checkAuthenticationState();
  
  // Create and inject the UI elements
  createUIElements();
  
  // Set up event listeners
  setupEventListeners();
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'authStateChanged') {
      currentUser = request.user;
      if (currentUser) {
        loadUserSettings();
      }
      updateAuthStatus(currentUser !== null);
    } else if (request.action === 'triggerAI') {
      // Triggered from context menu
      if (request.selectedText) {
        populatePromptWithSelection(request.selectedText);
      }
      showContextMenu(window.innerWidth / 2, window.innerHeight / 2);
    }
    
    sendResponse({ success: true });
  });
}

function createUIElements() {
  // Create speech bubble
  const speechBubble = document.createElement('div');
  speechBubble.id = 'speechBubble';
  speechBubble.textContent = 'Hello!';
  document.body.appendChild(speechBubble);

  // Create custom context menu
  const customContextMenu = document.createElement('div');
  customContextMenu.id = 'customContextMenu';
  customContextMenu.className = 'hidden';
  customContextMenu.innerHTML = `
    <div id="menuOptions">
      <div class="menu-item" data-action="cut">Cut</div>
      <div class="menu-item" data-action="copy">Copy</div>
      <div class="menu-item" data-action="paste">Paste</div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="inspect">Inspect Element <span class="shortcut">⌘⌥I</span></div>
    </div>
    <div class="menu-separator"></div>
    <div class="input-group">
      <input type="text" id="promptInput" placeholder="Ask AI about this...">
      <button id="sendToAI" class="mac-aqua-button aqua-button-blue">Ask</button>
    </div>
    <div id="screenshotPreview"></div>
    <div id="aiResponse" class="hidden">
      <div class="loading hidden">Processing...</div>
      <div class="response-text"></div>
    </div>
  `;
  document.body.appendChild(customContextMenu);

  // Create inspector panel
  const inspectorPanel = document.createElement('div');
  inspectorPanel.id = 'inspectorPanel';
  inspectorPanel.className = 'hidden';
  inspectorPanel.innerHTML = `
    <div class="inspector-header">
      <span>Element Inspector</span>
      <button class="close-button">×</button>
    </div>
    <div class="inspector-content">
      <div class="element-path"></div>
      <div class="element-attributes"></div>
      <div class="element-styles"></div>
      <div class="inspector-tip">
        Press ⌘⌥I (Mac) or Ctrl+Shift+I (Windows) to open Chrome DevTools
      </div>
    </div>
  `;
  document.body.appendChild(inspectorPanel);

  // Create auth status indicator
  const authIndicator = document.createElement('div');
  authIndicator.id = 'authIndicator';
  authIndicator.innerHTML = `
    <div id="authStatus">
      <div id="authContent">
        <div id="signInPrompt" class="auth-section">
          <span style="font-size: 11px; color: #666;">Sign in to save conversations</span>
          <button id="openAuthBtn" onclick="openAuthPage()" class="auth-button">Sign In</button>
        </div>
        <div id="userInfo" class="auth-section" style="display: none;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div id="userAvatar" class="user-avatar-small"></div>
            <span id="userEmail" style="font-size: 11px; color: #333;"></span>
          </div>
          <span style="font-size: 10px; color: #666;">✅ Auto-saving conversations</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(authIndicator);
}

function setupEventListeners() {
  // Prevent the default context menu and store clicked element
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    lastRightClickedElement = e.target;
    lastRightClickX = e.clientX;
    lastRightClickY = e.clientY;
    
    // Check if we have selected text and populate the input field
    const selectedText = getSelectedText();
    if (selectedText.trim()) {
      populatePromptWithSelection(selectedText);
    }
    
    // Show context menu immediately for text selection
    if (selectedText.trim() && !isSelecting) {
      showContextMenu(e.clientX, e.clientY);
    }
  });

  // Speech Bubble
  document.addEventListener("mousemove", (e) => {
    const speechBubble = document.getElementById("speechBubble");
    if (speechBubble) {
      speechBubble.style.left = (e.pageX + 15) + "px";
      speechBubble.style.top = (e.pageY + 15) + "px";
    }
  });

  // Menu options click handler
  document.addEventListener("click", (e) => {
    if (e.target.matches(".menu-item")) {
      handleMenuAction(e.target.getAttribute("data-action"));
    }
    
    // Hide context menu when clicking outside
    const customMenu = document.getElementById("customContextMenu");
    if (customMenu && !customMenu.contains(e.target)) {
      customMenu.classList.add("hidden");
      document.getElementById("promptInput").value = "";
    }
  });

  // Right-click drag selection for screenshots
  document.addEventListener("mousedown", (e) => {
    if (e.button === 2) { // Right-click
      const selectedText = getSelectedText();
      if (!selectedText.trim()) {
        isSelecting = true;
        startX = e.pageX;
        startY = e.pageY;
        selectionBox = document.createElement("div");
        selectionBox.className = "selection-box";
        selectionBox.style.left = startX + "px";
        selectionBox.style.top = startY + "px";
        document.body.appendChild(selectionBox);
      }
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (isSelecting && selectionBox) {
      const currentX = e.pageX;
      const currentY = e.pageY;
      const x = Math.min(currentX, startX);
      const y = Math.min(currentY, startY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      selectionBox.style.left = x + "px";
      selectionBox.style.top = y + "px";
      selectionBox.style.width = width + "px";
      selectionBox.style.height = height + "px";
    }
  });

  document.addEventListener("mouseup", async (e) => {
    if (isSelecting && e.button === 2) {
      isSelecting = false;
      await handleScreenshotSelection(e);
    }
  });

  // Prompt input handlers
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "promptInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const prompt = e.target.value.trim();
      if (prompt) {
        sendToOpenAI(prompt, screenshotDataURL);
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "sendToAI") {
      const prompt = document.getElementById("promptInput").value;
      if (prompt.trim()) {
        sendToOpenAI(prompt, screenshotDataURL);
      }
    }
  });

  // Inspector panel close
  document.addEventListener("click", (e) => {
    if (e.target.matches('#inspectorPanel .close-button')) {
      const panel = document.getElementById('inspectorPanel');
      panel.classList.add('hidden');
      if (inspectedElement) {
        inspectedElement.classList.remove('highlight-inspect');
        inspectedElement = null;
      }
    }
  });

  // Speech-to-text on right-click within prompt input
  const promptInput = document.getElementById("promptInput");
  if (promptInput) {
    promptInput.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.log("Speech Recognition API not supported in this browser.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.start();
      
      recognition.onresult = function(event) {
        let transcript = event.results[0][0].transcript;
        const start = promptInput.selectionStart;
        const end = promptInput.selectionEnd;
        const before = promptInput.value.substring(0, start);
        const after = promptInput.value.substring(end);
        promptInput.value = before + transcript + after;
        const newPos = start + transcript.length;
        promptInput.setSelectionRange(newPos, newPos);
      };
      
      recognition.onerror = function(event) {
        console.error("Speech recognition error:", event.error);
      };
    });
  }
}

// NEW: Check authentication state
async function checkAuthenticationState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuthState' });
    
    if (response.success && response.authenticated) {
      currentUser = response.user;
      await loadUserSettings();
      updateAuthStatus(true);
    } else {
      updateAuthStatus(false);
    }
    
    isAuthChecked = true;
  } catch (error) {
    console.error('Error checking auth state:', error);
    isAuthChecked = true;
  }
}

// NEW: Load user settings from Firebase
async function loadUserSettings() {
  if (!currentUser) return;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getUserSettings' });
    
    if (response.success) {
      userSettings = response.settings || {};
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
}

// NEW: Update auth status in UI
function updateAuthStatus(authenticated) {
  const signInPrompt = document.getElementById('signInPrompt');
  const userInfo = document.getElementById('userInfo');
  
  if (authenticated && currentUser) {
    signInPrompt.style.display = 'none';
    userInfo.style.display = 'block';
    
    const avatar = document.getElementById('userAvatar');
    const email = document.getElementById('userEmail');
    
    if (avatar) avatar.textContent = currentUser.email.charAt(0).toUpperCase();
    if (email) email.textContent = currentUser.email;
  } else {
    signInPrompt.style.display = 'block';
    userInfo.style.display = 'none';
  }
}

// NEW: Open authentication page
window.openAuthPage = () => {
  chrome.runtime.sendMessage({ action: 'openAuthPage' });
};

// Helper function to get selected text
function getSelectedText() {
  return window.getSelection().toString();
}

// Helper function to populate prompt input with selected text
function populatePromptWithSelection(selectedText) {
  const promptInput = document.getElementById("promptInput");
  if (!promptInput) return;
  
  const currentValue = promptInput.value.trim();
  
  if (!currentValue) {
    promptInput.value = `Explain this text: "${selectedText}"`;
  } else {
    promptInput.value = currentValue + `\n\nSelected text: "${selectedText}"`;
  }
  
  promptInput.focus();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
}

// Helper function to show context menu
function showContextMenu(x, y, hasScreenshot = false) {
  const customMenu = document.getElementById("customContextMenu");
  if (!customMenu) return;
  
  const previewContainer = document.getElementById("screenshotPreview");
  
  if (!hasScreenshot) {
    previewContainer.innerHTML = "";
    screenshotDataURL = null;
  }
  
  customMenu.style.left = x + "px";
  customMenu.style.top = y + "px";
  customMenu.classList.remove("hidden");
  
  const promptInput = document.getElementById("promptInput");
  if (promptInput && promptInput.value.trim()) {
    setTimeout(() => promptInput.focus(), 100);
  }
}

// Handle menu actions
async function handleMenuAction(action) {
  const selectedText = getSelectedText();
  
  switch(action) {
    case "cut":
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText);
          if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            const el = document.activeElement;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.value = el.value.slice(0, start) + el.value.slice(end);
          }
        } catch (err) {
          console.error('Failed to cut text:', err);
        }
      }
      break;

    case "copy":
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText);
        } catch (err) {
          console.error('Failed to copy text:', err);
        }
      }
      break;

    case "paste":
      try {
        const text = await navigator.clipboard.readText();
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
          insertTextAtCursor(document.activeElement, text);
        }
      } catch (err) {
        console.error('Failed to paste text:', err);
      }
      break;

    case "inspect":
      showInspector(lastRightClickedElement);
      break;
  }
  
  document.getElementById("customContextMenu").classList.add("hidden");
}

// Handle screenshot selection
async function handleScreenshotSelection(e) {
  if (!selectionBox) return;
  
  let boxRect = selectionBox.getBoundingClientRect();
  document.body.removeChild(selectionBox);
  selectionBox = null;

  if (boxRect.width < 10 || boxRect.height < 10) {
    showContextMenu(e.pageX, e.pageY);
    return;
  }

  try {
    // Import html2canvas dynamically
    if (!window.html2canvas) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    const scaledWidth = boxRect.width * dpr;
    const scaledHeight = boxRect.height * dpr;

    const canvas = await html2canvas(document.body, {
      scale: dpr,
      useCORS: true,
      logging: false,
      windowWidth: document.documentElement.offsetWidth,
      windowHeight: document.documentElement.offsetHeight
    });

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = scaledWidth;
    croppedCanvas.height = scaledHeight;
    
    const ctx = croppedCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    
    ctx.drawImage(
      canvas,
      boxRect.left * dpr, boxRect.top * dpr, scaledWidth, scaledHeight,
      0, 0, boxRect.width, boxRect.height
    );

    screenshotDataURL = croppedCanvas.toDataURL("image/png");

    const previewContainer = document.getElementById("screenshotPreview");
    previewContainer.innerHTML = "";
    const img = document.createElement("img");
    img.src = screenshotDataURL;
    img.style.width = Math.min(boxRect.width, 200) + "px";
    img.style.height = Math.min(boxRect.height, 150) + "px";
    img.style.objectFit = "contain";
    previewContainer.appendChild(img);

    const promptInput = document.getElementById("promptInput");
    if (!promptInput.value.trim()) {
      promptInput.value = "Analyze this screenshot and explain what you see.";
    }

    showContextMenu(
      boxRect.left + boxRect.width / 2,
      boxRect.top + boxRect.height / 2,
      true
    );
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    showContextMenu(e.pageX, e.pageY);
  }
}

// Helper function to insert text at cursor position
function insertTextAtCursor(element, text) {
  const start = element.selectionStart;
  const end = element.selectionEnd;
  const before = element.value.substring(0, start);
  const after = element.value.substring(end);
  element.value = before + text + after;
  element.selectionStart = element.selectionEnd = start + text.length;
}

// NEW: Create AI response bubble
function createResponseBubble(x, y, prompt, isLoading = true) {
  const bubbleId = `bubble-${bubbleCounter++}`;
  const bubble = document.createElement('div');
  bubble.className = 'ai-response-bubble' + (isLoading ? ' loading' : '');
  bubble.id = bubbleId;
  bubble.style.left = (x - 16) + 'px';
  bubble.style.top = (y - 16) + 'px';
  
  document.body.appendChild(bubble);
  
  const bubbleData = {
    id: bubbleId,
    element: bubble,
    x: x,
    y: y,
    conversation: [
      {
        role: 'user',
        content: prompt,
        timestamp: new Date()
      }
    ],
    isLoading: isLoading
  };
  
  responseBubbles.push(bubbleData);
  
  bubble.addEventListener('click', () => {
    if (!bubbleData.isLoading) {
      showConversationPanel(bubbleData);
    }
  });
  
  return bubbleData;
}

// NEW: Update bubble when response arrives
function updateResponseBubble(bubbleData, response) {
  bubbleData.conversation.push({
    role: 'assistant',
    content: response,
    timestamp: new Date()
  });
  bubbleData.isLoading = false;
  bubbleData.element.classList.remove('loading');
}

// MODIFIED: Updated sendToOpenAI function to use background script
async function sendToOpenAI(prompt, screenshot) {
  const bubble = createResponseBubble(lastRightClickX, lastRightClickY, prompt, true);
  
  document.getElementById("customContextMenu").classList.add("hidden");
  
  try {
    let messages = [
      {
        role: "system",
        content: "You are a helpful assistant analyzing text and images."
      }
    ];

    messages = messages.concat(
      bubble.conversation.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    );

    if (screenshot) {
      messages.push({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: screenshot
            }
          }
        ]
      });
    }

    const response = await chrome.runtime.sendMessage({
      action: 'makeOpenAIRequest',
      data: {
        messages: messages,
        model: userSettings.defaultModel || 'gpt-4o',
        maxTokens: userSettings.maxTokens || 500
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'API request failed');
    }

    const aiResponse = response.response;
    updateResponseBubble(bubble, aiResponse);
    
    // Save conversation to Firebase if user is authenticated
    if (currentUser && userSettings.autoSave !== false) {
      saveConversationToFirebase(bubble);
    }
    
  } catch (error) {
    updateResponseBubble(bubble, `Error: ${error.message}`);
    
    if (error.message.includes('not authenticated') || error.message.includes('API key')) {
      showAuthPrompt();
    }
  }
  
  document.getElementById("promptInput").value = "";
}

// NEW: Save conversation to Firebase
async function saveConversationToFirebase(bubbleData) {
  try {
    const conversationData = {
      conversation: bubbleData.conversation,
      coordinates: { x: bubbleData.x, y: bubbleData.y },
      pageUrl: window.location.href,
      pageTitle: document.title,
      domain: window.location.hostname,
      timestamp: new Date().toISOString()
    };

    const response = await chrome.runtime.sendMessage({
      action: 'saveConversation',
      data: conversationData
    });

    if (response.success) {
      bubbleData.element.style.border = '2px solid #28a745';
      setTimeout(() => {
        if (bubbleData.element) {
          bubbleData.element.style.border = '2px solid rgba(255, 255, 255, 0.9)';
        }
      }, 2000);
    }
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

// NEW: Show authentication prompt
function showAuthPrompt() {
  const authModal = document.createElement('div');
  authModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
    backdrop-filter: blur(5px);
  `;
  
  authModal.innerHTML = `
    <div style="
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      width: 400px;
      max-width: 90vw;
      text-align: center;
    ">
      <h3 style="margin: 0 0 16px 0; color: #333;">Sign in Required</h3>
      <p style="margin: 0 0 20px 0; color: #666; line-height: 1.4;">
        Sign in to use AI features and save your conversations for later review.
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
          padding: 10px 20px;
          border: 1px solid #ddd;
          background: #f5f5f5;
          border-radius: 6px;
          cursor: pointer;
        ">Cancel</button>
        <button onclick="openAuthPage(); this.parentElement.parentElement.parentElement.remove();" style="
          padding: 10px 20px;
          border: none;
          background: #0064e1;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        ">Sign In</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(authModal);
}

// Show conversation panel (keeping your existing implementation)
function showConversationPanel(bubbleData) {
  // Close any existing conversation panel
  if (activeConversationPanel) {
    activeConversationPanel.classList.remove('visible');
    setTimeout(() => activeConversationPanel.remove(), 300);
  }
  
  const panel = document.createElement('div');
  panel.className = 'ai-conversation-panel';
  activeConversationPanel = panel;
  
  panel.innerHTML = `
    <div class="ai-conversation-header">
      <span class="ai-conversation-title">AI Conversation</span>
      <div class="ai-conversation-controls">
        <button class="ai-conversation-minimize">−</button>
        <button class="ai-conversation-close">×</button>
      </div>
    </div>
    <div class="ai-conversation-messages" id="messages-${bubbleData.id}">
      ${renderConversationHistory(bubbleData.conversation)}
    </div>
    <div class="ai-conversation-input">
      <div class="input-container">
        <textarea id="continue-input-${bubbleData.id}" placeholder="Continue the conversation..." rows="2"></textarea>
        <button class="send-button" data-bubble-id="${bubbleData.id}">
          <span class="send-icon">→</span>
        </button>
      </div>
      <div class="input-actions">
        <button class="action-button clear-btn" data-bubble-id="${bubbleData.id}">Clear History</button>
        <button class="action-button copy-btn" data-bubble-id="${bubbleData.id}">Copy All</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Position and show panel
  positionConversationPanel(panel, bubbleData);
  setTimeout(() => panel.classList.add('visible'), 10);
  
  // Focus input and setup handlers
  const input = panel.querySelector(`#continue-input-${bubbleData.id}`);
  input.focus();
  setupConversationPanelHandlers(panel, bubbleData);
}

function renderConversationHistory(conversation) {
  return conversation.map((message, index) => {
    const timeStr = message.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const isUser = message.role === 'user';
    return `
      <div class="message ${isUser ? 'user-message' : 'ai-message'}">
        <div class="message-header">
          <span class="message-role">${isUser ? 'You' : 'AI'}</span>
          <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-content">${message.content}</div>
      </div>
    `;
  }).join('');
}

function positionConversationPanel(panel, bubbleData) {
  const bubbleRect = bubbleData.element.getBoundingClientRect();
  const panelWidth = 450;
  const panelHeight = 500;
  
  let panelX = bubbleRect.right + 15;
  let panelY = bubbleRect.top - 10;
  
  if (panelX + panelWidth > window.innerWidth) {
    panelX = bubbleRect.left - panelWidth - 15;
  }
  if (panelY + panelHeight > window.innerHeight) {
    panelY = window.innerHeight - panelHeight - 20;
  }
  if (panelX < 10) panelX = 10;
  if (panelY < 10) panelY = 10;
  
  panel.style.left = panelX + 'px';
  panel.style.top = panelY + 'px';
}

function setupConversationPanelHandlers(panel, bubbleData) {
  const input = panel.querySelector(`#continue-input-${bubbleData.id}`);
  const sendBtn = panel.querySelector(`.send-button[data-bubble-id="${bubbleData.id}"]`);
  const closeBtn = panel.querySelector('.ai-conversation-close');
  const minimizeBtn = panel.querySelector('.ai-conversation-minimize');
  const clearBtn = panel.querySelector(`.clear-btn[data-bubble-id="${bubbleData.id}"]`);
  const copyBtn = panel.querySelector(`.copy-btn[data-bubble-id="${bubbleData.id}"]`);
  const messagesContainer = panel.querySelector(`#messages-${bubbleData.id}`);
  
  const sendMessage = async () => {
    const message = input.value.trim();
    if (!message) return;
    
    bubbleData.conversation.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="loading-dots">⋯</span>';
    
    messagesContainer.innerHTML = renderConversationHistory(bubbleData.conversation);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    try {
      const response = await continueConversation(bubbleData.conversation);
      
      bubbleData.conversation.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      
      messagesContainer.innerHTML = renderConversationHistory(bubbleData.conversation);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Save updated conversation
      if (currentUser && userSettings.autoSave !== false) {
        saveConversationToFirebase(bubbleData);
      }
      
    } catch (error) {
      bubbleData.conversation.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date()
      });
      messagesContainer.innerHTML = renderConversationHistory(bubbleData.conversation);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span class="send-icon">→</span>';
      input.focus();
    }
  };
  
  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('visible');
    setTimeout(() => {
      panel.remove();
      if (activeConversationPanel === panel) {
        activeConversationPanel = null;
      }
    }, 300);
  });
  
  minimizeBtn.addEventListener('click', () => {
    panel.classList.toggle('minimized');
  });
  
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear this conversation history?')) {
      bubbleData.conversation = bubbleData.conversation.slice(0, 1);
      messagesContainer.innerHTML = renderConversationHistory(bubbleData.conversation);
    }
  });
  
  copyBtn.addEventListener('click', async () => {
    const conversationText = bubbleData.conversation
      .map(msg => `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`)
      .join('\n\n');
    
    try {
      await navigator.clipboard.writeText(conversationText);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy All', 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
  
  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  
  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function outsideClickHandler(e) {
      if (!panel.contains(e.target) && !bubbleData.element.contains(e.target)) {
        panel.classList.remove('visible');
        setTimeout(() => {
          panel.remove();
          if (activeConversationPanel === panel) {
            activeConversationPanel = null;
          }
        }, 300);
        document.removeEventListener('click', outsideClickHandler);
      }
    });
  }, 100);
}

// NEW: Continue conversation with AI
async function continueConversation(conversation) {
  try {
    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant. Continue the conversation naturally based on the context provided."
      },
      ...conversation.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    ];

    const response = await chrome.runtime.sendMessage({
      action: 'makeOpenAIRequest',
      data: {
        messages: messages,
        model: userSettings.defaultModel || 'gpt-4o',
        maxTokens: userSettings.maxTokens || 500
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'API request failed');
    }

    return response.response;
    
  } catch (error) {
    throw error;
  }
}

// Helper functions for inspector
function getElementPath(element) {
  const path = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.tagName.toLowerCase();
    if (element.id) {
      selector += '#' + element.id;
    } else if (element.className) {
      selector += '.' + Array.from(element.classList).join('.');
    }
    path.unshift(selector);
    element = element.parentNode;
  }
  return path.join(' > ');
}

function getElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const important = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-size', 'font-family'];
  const styles = {};
  important.forEach(prop => {
    styles[prop] = computed[prop];
  });
  return styles;
}

function getElementAttributes(element) {
  const attributes = {};
  for (let attr of element.attributes) {
    attributes[attr.name] = attr.value;
  }
  return attributes;
}

function showInspector(element) {
  const panel = document.getElementById('inspectorPanel');
  const pathDiv = panel.querySelector('.element-path');
  const attributesDiv = panel.querySelector('.element-attributes');
  const stylesDiv = panel.querySelector('.element-styles');

  // Remove previous highlight
  if (inspectedElement) {
    inspectedElement.classList.remove('highlight-inspect');
  }

  // Highlight new element
  inspectedElement = element;
  element.classList.add('highlight-inspect');

  // Update path
  pathDiv.textContent = getElementPath(element);

  // Update attributes
  const attrs = getElementAttributes(element);
  attributesDiv.innerHTML = Object.entries(attrs)
    .map(([key, value]) => `<div><strong>${key}</strong>: ${value}</div>`)
    .join('');

  // Update styles
  const styles = getElementStyles(element);
  stylesDiv.innerHTML = Object.entries(styles)
    .map(([prop, value]) => `<div><strong>${prop}</strong>: ${value};</div>`)
    .join('');

  panel.classList.remove('hidden');
}

// Clean up function for when page unloads
window.addEventListener('beforeunload', () => {
  // Clean up any active panels or bubbles
  responseBubbles.forEach(bubble => {
    if (bubble.element && bubble.element.parentNode) {
      bubble.element.remove();
    }
  });
  
  if (activeConversationPanel && activeConversationPanel.parentNode) {
    activeConversationPanel.remove();
  }
});

console.log('AI Context Assistant content script initialized');