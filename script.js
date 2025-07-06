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

// Configuration
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// API Key storage (in-memory for this session)
let apiKey = null;

// Get device pixel ratio
const dpr = window.devicePixelRatio || 1;

// Update API key status display
function updateApiKeyStatus() {
  const inputContainer = document.getElementById('apiKeyInput');
  const statusDiv = document.getElementById('apiKeyStatus');
  const statusText = document.getElementById('statusText');
  
  if (apiKey) {
    inputContainer.classList.add('hidden');
    statusDiv.classList.remove('hidden');
    statusText.textContent = '✅ API Key Active';
  } else {
    inputContainer.classList.remove('hidden');
    statusDiv.classList.add('hidden');
  }
}

// Validate API key format
function isValidApiKeyFormat(key) {
  return key && key.trim().startsWith('sk-') && key.trim().length > 20;
}

// Test API key with a simple request
async function testApiKey(key) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Initialize status on page load
document.addEventListener('DOMContentLoaded', () => {
  updateApiKeyStatus();
  
  const apiKeyField = document.getElementById('apiKeyField');
  const saveButton = document.getElementById('saveApiKey');
  const testButton = document.getElementById('testApiKey');
  const changeButton = document.getElementById('changeApiKey');
  
  // Save API key
  saveButton.addEventListener('click', async () => {
    const key = apiKeyField.value.trim();
    
    if (!isValidApiKeyFormat(key)) {
      apiKeyField.classList.add('error');
      apiKeyField.placeholder = 'Invalid format! Must start with sk-';
      return;
    }
    
    apiKeyField.classList.remove('error');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    
    try {
      // Test the API key
      const isValid = await testApiKey(key);
      
      if (isValid) {
        apiKey = key;
        apiKeyField.value = '';
        updateApiKeyStatus();
      } else {
        apiKeyField.classList.add('error');
        apiKeyField.placeholder = 'Invalid API key! Check your key.';
      }
    } catch (error) {
      apiKeyField.classList.add('error');
      apiKeyField.placeholder = 'Error testing key. Try again.';
    }
    
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  });
  
  // Test API key without saving
  testButton.addEventListener('click', async () => {
    const key = apiKeyField.value.trim();
    
    if (!isValidApiKeyFormat(key)) {
      apiKeyField.classList.add('error');
      apiKeyField.placeholder = 'Invalid format! Must start with sk-';
      return;
    }
    
    apiKeyField.classList.remove('error');
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    
    try {
      const isValid = await testApiKey(key);
      
      if (isValid) {
        testButton.textContent = '✅ Valid';
        setTimeout(() => {
          testButton.textContent = 'Test';
          testButton.disabled = false;
        }, 2000);
      } else {
        testButton.textContent = '❌ Invalid';
        setTimeout(() => {
          testButton.textContent = 'Test';
          testButton.disabled = false;
        }, 2000);
      }
    } catch (error) {
      testButton.textContent = '❌ Error';
      setTimeout(() => {
        testButton.textContent = 'Test';
        testButton.disabled = false;
      }, 2000);
    }
  });
  
  // Change API key
  changeButton.addEventListener('click', () => {
    apiKey = null;
    updateApiKeyStatus();
    apiKeyField.focus();
  });
  
  // Enter key to save
  apiKeyField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Trigger the save button click (which is already async)
      saveButton.click();
    }
    // Clear error state on typing
    if (apiKeyField.classList.contains('error')) {
      apiKeyField.classList.remove('error');
      apiKeyField.placeholder = 'Enter OpenAI API Key (sk-...)';
    }
  });
});

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

// --- Speech Bubble ---
document.addEventListener("mousemove", (e) => {
  const speechBubble = document.getElementById("speechBubble");
  speechBubble.style.left = (e.pageX + 15) + "px";
  speechBubble.style.top = (e.pageY + 15) + "px";
});

// Helper function to get selected text
function getSelectedText() {
  return window.getSelection().toString();
}

// Helper function to populate prompt input with selected text
function populatePromptWithSelection(selectedText) {
  const promptInput = document.getElementById("promptInput");
  const currentValue = promptInput.value.trim();
  
  // If input is empty, add the selected text
  if (!currentValue) {
    promptInput.value = `Explain this text: "${selectedText}"`;
  } else {
    // If input has content, append the selected text
    promptInput.value = currentValue + `\n\nSelected text: "${selectedText}"`;
  }
  
  // Focus the input for immediate editing
  promptInput.focus();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
}

// Helper function to show context menu
function showContextMenu(x, y, hasScreenshot = false) {
  const customMenu = document.getElementById("customContextMenu");
  const previewContainer = document.getElementById("screenshotPreview");
  
  // Clear old screenshot preview if no new screenshot
  if (!hasScreenshot) {
    previewContainer.innerHTML = "";
    screenshotDataURL = null;
  }
  
  // Position the context menu
  customMenu.style.left = x + "px";
  customMenu.style.top = y + "px";
  customMenu.classList.remove("hidden");
  
  // Focus the prompt input if it has content
  const promptInput = document.getElementById("promptInput");
  if (promptInput.value.trim()) {
    setTimeout(() => promptInput.focus(), 100);
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

// Update the menu options click handler
document.getElementById("menuOptions").addEventListener("click", async function(e) {
  if (e.target && e.target.matches(".menu-item")) {
    const action = e.target.getAttribute("data-action");
    const selectedText = getSelectedText();
    
    switch(action) {
      case "cut":
        if (selectedText) {
          try {
            await navigator.clipboard.writeText(selectedText);
            // If the selection is in an input/textarea, remove the text
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
        simulateInspectShortcut().catch(console.error);
        break;
    }
    
    // Hide the context menu after action
    document.getElementById("customContextMenu").classList.add("hidden");
  }
});

// --- Right-Click Drag Selection & Screenshot ---
document.addEventListener("mousedown", (e) => {
  if (e.button === 2) { // Right-click
    // Only start selection if we don't have selected text
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

    // Get the bounding rectangle of the selection box
    let boxRect = selectionBox.getBoundingClientRect();
    // Remove the selection box from the DOM
    document.body.removeChild(selectionBox);
    selectionBox = null;

    // Enforce minimum selection area of 10×10
    if (boxRect.width < 10 || boxRect.height < 10) {
      showContextMenu(e.pageX, e.pageY);
      return;
    }

    try {
      // Calculate the scaled dimensions
      const scaledWidth = boxRect.width * dpr;
      const scaledHeight = boxRect.height * dpr;

      // Create canvas with device pixel ratio
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
      
      // Draw the scaled and cropped image
      ctx.drawImage(
        canvas,
        boxRect.left * dpr, boxRect.top * dpr, scaledWidth, scaledHeight,
        0, 0, boxRect.width, boxRect.height
      );

      // Get the screenshot data URL
      screenshotDataURL = croppedCanvas.toDataURL("image/png");

      // Create preview image with correct CSS dimensions
      const previewContainer = document.getElementById("screenshotPreview");
      previewContainer.innerHTML = "";
      const img = document.createElement("img");
      img.src = screenshotDataURL;
      img.style.width = Math.min(boxRect.width, 200) + "px";
      img.style.height = Math.min(boxRect.height, 150) + "px";
      img.style.objectFit = "contain";
      previewContainer.appendChild(img);

      // Update prompt input with screenshot context
      const promptInput = document.getElementById("promptInput");
      if (!promptInput.value.trim()) {
        promptInput.value = "Analyze this screenshot and explain what you see.";
      }

      // Show context menu with screenshot
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
});

document.addEventListener("click", (e) => {
  const customMenu = document.getElementById("customContextMenu");
  if (!customMenu.contains(e.target)) {
    customMenu.classList.add("hidden");
    // Clear the prompt input when menu is hidden
    document.getElementById("promptInput").value = "";
  }
});

// --- Clipboard Options Functionality ---
// Add mousedown/up listeners to switch button states.
const buttons = document.querySelectorAll("#menuOptions .mac-aqua-button");
buttons.forEach(button => {
  button.addEventListener("mousedown", () => {
    button.classList.remove("aqua-button-grey");
    button.classList.add("aqua-button-blue");
  });
  button.addEventListener("mouseup", () => {
    button.classList.remove("aqua-button-blue");
    button.classList.add("aqua-button-grey");
  });
  button.addEventListener("mouseleave", () => {
    button.classList.remove("aqua-button-blue");
    button.classList.add("aqua-button-grey");
  });
});

// --- Prompt Input "Send" Action ---
document.getElementById("promptInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const prompt = e.target.value.trim();
    if (prompt) {
      sendToOpenAI(prompt, screenshotDataURL);
    }
  }
});

// --- Speech-to-Text on Right-Click within Prompt Input ---
const promptInput = document.getElementById("promptInput");
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
  console.log("Speech recognition started...");
  recognition.onresult = function(event) {
    let transcript = event.results[0][0].transcript;
    const start = promptInput.selectionStart;
    const end = promptInput.selectionEnd;
    const before = promptInput.value.substring(0, start);
    const after = promptInput.value.substring(end);
    promptInput.value = before + transcript + after;
    const newPos = start + transcript.length;
    promptInput.setSelectionRange(newPos, newPos);
    console.log("Speech recognition result:", transcript);
  };
  recognition.onerror = function(event) {
    console.error("Speech recognition error:", event.error);
  };
});

// Function to get or prompt for API key
async function getApiKey() {
  if (apiKey) {
    return apiKey;
  }
  
  // Create a custom modal for API key input
  return new Promise((resolve, reject) => {
    // Create modal elements
    const modal = document.createElement('div');
    modal.style.cssText = `
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
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      width: 400px;
      max-width: 90vw;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    modalContent.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #333; font-size: 18px;">Enter OpenAI API Key</h3>
      <p style="margin: 0 0 20px 0; color: #666; font-size: 14px; line-height: 1.4;">
        To use the AI features, please enter your OpenAI API key. You can get one from 
        <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #0064e1;">platform.openai.com</a>
      </p>
      <input type="password" id="apiKeyInput" placeholder="sk-..." style="
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        margin-bottom: 20px;
      ">
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="cancelApiKey" style="
          padding: 8px 16px;
          border: 1px solid #ddd;
          background: #f5f5f5;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">Cancel</button>
        <button id="saveApiKey" style="
          padding: 8px 16px;
          border: none;
          background: #0064e1;
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">Save & Continue</button>
      </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#apiKeyInput');
    const saveBtn = modal.querySelector('#saveApiKey');
    const cancelBtn = modal.querySelector('#cancelApiKey');
    
    // Focus the input
    input.focus();
    
    // Handle save
    const handleSave = () => {
      const key = input.value.trim();
      if (key) {
        apiKey = key;
        document.body.removeChild(modal);
        resolve(key);
      } else {
        input.style.borderColor = '#ff4444';
        input.placeholder = 'Please enter a valid API key';
      }
    };
    
    // Handle cancel
    const handleCancel = () => {
      document.body.removeChild(modal);
      reject(new Error('API key required'));
    };
    
    // Event listeners
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    });
    
    // Click outside to cancel
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    });
  });
}
  const aiResponse = document.getElementById("aiResponse");
  const loading = aiResponse.querySelector(".loading");
  const responseText = aiResponse.querySelector(".response-text");

  // Show loading state
  aiResponse.classList.remove("hidden");
  loading.classList.remove("hidden");
  responseText.textContent = "";

  async function sendToOpenAI(prompt, screenshot) {
  const aiResponse = document.getElementById("aiResponse");
  const loading = aiResponse.querySelector(".loading");
  const responseText = aiResponse.querySelector(".response-text");

  // Show loading state
  aiResponse.classList.remove("hidden");
  loading.classList.remove("hidden");
  responseText.textContent = "";

try {
    // For demo purposes, simulate API response since we can't access environment variables in browser
    // In a real implementation, you'd handle API keys more securely
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
    
    // Mock response based on input
    // let mockResponse = "";
    // if (screenshot && prompt.toLowerCase().includes("screenshot")) {
    //   mockResponse = "I can see a screenshot has been captured. In a real implementation, I would analyze the visual content and provide detailed insights about what's shown in the image.";
    // } else if (prompt.toLowerCase().includes("explain this text")) {
    //   mockResponse = "I would analyze the selected text and provide a comprehensive explanation, including context, meaning, and relevant insights.";
    // } else {
    //   mockResponse = `I received your prompt: "${prompt}". In a real implementation with OpenAI API, I would process this request and provide a detailed response based on the content.`;
    // }
    
    // responseText.textContent = mockResponse;
    
    // Note: In a real implementation, uncomment and use this API call:
    
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error("API key is required");
    }

    let messages = [
      {
        role: "system",
        content: "You are a helpful assistant analyzing text and images."
      },
      {
        role: "user",
        content: prompt
      }
    ];

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: messages,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    responseText.textContent = data.choices[0].message.content;
  } catch (error) {
    responseText.textContent = `Error: ${error.message}`;
  } finally {
    loading.classList.add("hidden");
  }
}

// Handle send button click
document.getElementById("sendToAI").addEventListener("click", () => {
  const prompt = document.getElementById("promptInput").value;
  if (prompt.trim()) {
    sendToOpenAI(prompt, screenshotDataURL);
  }
});

// Helper function to get element path
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

// Helper function to get computed styles
function getElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const important = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-size', 'font-family'];
  const styles = {};
  important.forEach(prop => {
    styles[prop] = computed[prop];
  });
  return styles;
}

// Helper function to get element attributes
function getElementAttributes(element) {
  const attributes = {};
  for (let attr of element.attributes) {
    attributes[attr.name] = attr.value;
  }
  return attributes;
}

// Function to show inspector panel
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

// Close inspector panel
document.querySelector('#inspectorPanel .close-button').addEventListener('click', () => {
  const panel = document.getElementById('inspectorPanel');
  panel.classList.add('hidden');
  if (inspectedElement) {
    inspectedElement.classList.remove('highlight-inspect');
    inspectedElement = null;
  }
});

// Helper function to detect OS
function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

// Function to simulate keyboard shortcut
async function simulateInspectShortcut() {
  const isMacOS = isMac();
  
  try {
    // Method 1: Chrome DevTools Protocol
    if (window.chrome && window.chrome.devtools) {
      await window.chrome.devtools.inspectedWindow.eval(
        `inspect(document.querySelector('${getElementPath(lastRightClickedElement)}'))`
      );
      return;
    }

    // Method 2: Keyboard Event
    const event = new KeyboardEvent('keydown', {
      key: 'i',
      code: 'KeyI',
      keyCode: 73,
      which: 73,
      altKey: isMacOS,
      metaKey: isMacOS,
      ctrlKey: !isMacOS,
      shiftKey: !isMacOS,
      bubbles: true
    });
    document.dispatchEvent(event);

    // Method 3: Direct function call (works in some browsers)
    if (typeof window.__devtoolsOpenFunction === 'function') {
      window.__devtoolsOpenFunction();
      return;
    }

    // Method 4: Debug URL (Chrome)
    const debugUrl = `javascript:(function() { 
      setTimeout(function() {
        debugger;
      }, 100);
    })();`;
    const debugLink = document.createElement('a');
    debugLink.href = debugUrl;
    debugLink.click();
    
  } catch (error) {
    console.log('Could not automatically open DevTools. Please use the keyboard shortcut:', 
      isMacOS ? '⌘⌥I' : 'Ctrl+Shift+I');
  }
}