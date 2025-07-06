// options.js - Chrome Extension Options Page JavaScript

// Global state
let currentUser = null;
let userSettings = {};
let conversations = [];
let filteredConversations = [];
let selectedConversations = new Set();
let currentPage = 1;
let conversationsPerPage = 10;

// DOM Elements
const sections = document.querySelectorAll('.section');
const navItems = document.querySelectorAll('.nav-item');
const conversationsList = document.getElementById('conversationsList');
const pagination = document.getElementById('pagination');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('Options page loaded');
  setupNavigation();
  setupEventListeners();
  
  // Check auth state and initialize
  checkAuthState();
});

function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSection = item.dataset.section;
      
      // Update active nav item
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update active section
      sections.forEach(section => section.classList.remove('active'));
      document.getElementById(targetSection).classList.add('active');
      
      // Load section-specific data
      loadSectionData(targetSection);
    });
  });
}

function setupEventListeners() {
  // General settings
  document.getElementById('saveGeneralSettings').addEventListener('click', saveGeneralSettings);
  
  // API settings
  document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
  document.getElementById('testApiKey').addEventListener('click', testApiKey);
  document.getElementById('removeApiKey').addEventListener('click', removeApiKey);
  document.getElementById('toggleApiKeyVisibility').addEventListener('click', toggleApiKeyVisibility);
  
  // Temperature slider
  const temperatureSlider = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  temperatureSlider.addEventListener('input', (e) => {
    temperatureValue.textContent = e.target.value;
  });
  
  // Account settings
  document.getElementById('updateProfile').addEventListener('click', updateProfile);
  document.getElementById('exportAllData').addEventListener('click', exportAllData);
  document.getElementById('importData').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importData);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  document.getElementById('deleteAccount').addEventListener('click', deleteAccount);
  
  // Conversation controls
  document.getElementById('searchConversations').addEventListener('input', debounce(filterConversations, 300));
  document.getElementById('searchBtn').addEventListener('click', filterConversations);
  document.getElementById('filterDomain').addEventListener('change', filterConversations);
  document.getElementById('filterDate').addEventListener('change', filterConversations);
  document.getElementById('sortBy').addEventListener('change', filterConversations);
  document.getElementById('selectAll').addEventListener('click', selectAllConversations);
  document.getElementById('exportSelected').addEventListener('click', exportSelectedConversations);
  document.getElementById('deleteSelected').addEventListener('click', deleteSelectedConversations);
  
  // Pagination
  document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
  document.getElementById('nextPage').addEventListener('click', () => changePage(1));
  
  // Modal handlers
  setupModalHandlers();
  
  // Handle hash navigation
  window.addEventListener('hashchange', handleHashNavigation);
  handleHashNavigation(); // Handle initial hash
}

function setupModalHandlers() {
  // Conversation modal
  document.querySelectorAll('.modal-close, #modalClose').forEach(btn => {
    btn.addEventListener('click', () => hideModal('conversationModal'));
  });
  
  document.getElementById('modalExport').addEventListener('click', exportCurrentConversation);
  document.getElementById('modalDelete').addEventListener('click', deleteCurrentConversation);
  
  // Confirm modal
  document.getElementById('confirmCancel').addEventListener('click', () => hideModal('confirmModal'));
  document.getElementById('confirmOk').addEventListener('click', executeConfirmAction);
  
  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideModal(modal.id);
      }
    });
  });
}

async function checkAuthState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuthState' });
    
    if (response.success && response.authenticated) {
      currentUser = response.user;
      await initializeUserData();
    } else {
      // Redirect to auth page if not authenticated
      showToast('Please sign in to access settings', 'warning');
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/auth.html') });
        window.close();
      }, 2000);
    }
  } catch (error) {
    console.error('Error checking auth state:', error);
    showToast('Connection error. Please try again.', 'error');
  }
}

async function initializeUserData() {
  try {
    // Update header
    updateHeader();
    
    // Load user settings
    await loadUserSettings();
    
    // Load conversations
    await loadAllConversations();
    
    // Update stats
    updateStats();
    
    // Load initial section
    loadSectionData('general');
    
  } catch (error) {
    console.error('Error initializing user data:', error);
    showToast('Error loading user data', 'error');
  }
}

function updateHeader() {
  const avatar = document.getElementById('headerAvatar');
  const email = document.getElementById('headerEmail');
  
  if (currentUser) {
    avatar.textContent = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
    email.textContent = currentUser.email;
  }
}

async function loadUserSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getUserSettings' });
    
    if (response.success) {
      userSettings = response.settings || {};
      populateSettingsForm();
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
}

function populateSettingsForm() {
  // General settings
  document.getElementById('autoSave').value = userSettings.autoSave !== false ? 'true' : 'false';
  document.getElementById('maxHistory').value = userSettings.maxHistory || 100;
  document.getElementById('bubbleTheme').value = userSettings.bubbleTheme || 'blue';
  document.getElementById('contextMenuPosition').value = userSettings.contextMenuPosition || 'cursor';
  
  // API settings
  document.getElementById('defaultModel').value = userSettings.defaultModel || 'gpt-4o';
  document.getElementById('maxTokens').value = userSettings.maxTokens || 500;
  
  const temperature = userSettings.temperature || 0.7;
  document.getElementById('temperature').value = temperature;
  document.getElementById('temperatureValue').textContent = temperature;
  
  // Update API key status
  updateApiKeyStatus(!!userSettings.encryptedApiKey);
  
  // Account settings
  if (currentUser) {
    document.getElementById('displayName').value = currentUser.displayName || '';
    document.getElementById('profileName').textContent = currentUser.displayName || 'User';
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileAvatar').textContent = 
      (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
    
    // Set join date (placeholder - would need to be stored in user data)
    document.getElementById('joinDate').textContent = 'Recently';
  }
}

async function loadAllConversations() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'getUserConversations',
      limit: 1000 // Get all conversations
    });
    
    if (response.success) {
      conversations = response.conversations || [];
      filteredConversations = [...conversations];
      
      // Populate domain filter
      populateDomainFilter();
      
      // Update conversations display
      renderConversations();
    }
  } catch (error) {
    console.error('Error loading conversations:', error);
    showToast('Error loading conversations', 'error');
  }
}

function populateDomainFilter() {
  const domainFilter = document.getElementById('filterDomain');
  const domains = [...new Set(conversations.map(conv => conv.domain).filter(Boolean))];
  
  // Clear existing options except "All domains"
  domainFilter.innerHTML = '<option value="">All domains</option>';
  
  domains.sort().forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    domainFilter.appendChild(option);
  });
}

function updateStats() {
  const totalConversations = conversations.length;
  const totalMessages = conversations.reduce((sum, conv) => 
    sum + (conv.conversation ? conv.conversation.length : 0), 0);
  
  // Calculate today's conversations
  const today = new Date().toDateString();
  const todayConversations = conversations.filter(conv => {
    if (!conv.updatedAt) return false;
    const convDate = conv.updatedAt.toDate ? 
      conv.updatedAt.toDate() : new Date(conv.updatedAt);
    return convDate.toDateString() === today;
  }).length;
  
  // Calculate average per day (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentConversations = conversations.filter(conv => {
    if (!conv.updatedAt) return false;
    const convDate = conv.updatedAt.toDate ? 
      conv.updatedAt.toDate() : new Date(conv.updatedAt);
    return convDate >= thirtyDaysAgo;
  }).length;
  const averagePerDay = Math.round(recentConversations / 30 * 10) / 10;
  
  // Update UI
  document.getElementById('totalConversations').textContent = totalConversations;
  document.getElementById('totalMessages').textContent = totalMessages;
  document.getElementById('activeToday').textContent = todayConversations;
  document.getElementById('averagePerDay').textContent = averagePerDay;
}

function loadSectionData(sectionId) {
  switch (sectionId) {
    case 'conversations':
      renderConversations();
      break;
    case 'account':
      // Account data already loaded
      break;
    // Other sections don't need dynamic loading
  }
}

// Settings Functions
async function saveGeneralSettings() {
  try {
    const settings = {
      ...userSettings,
      autoSave: document.getElementById('autoSave').value === 'true',
      maxHistory: parseInt(document.getElementById('maxHistory').value),
      bubbleTheme: document.getElementById('bubbleTheme').value,
      contextMenuPosition: document.getElementById('contextMenuPosition').value,
      defaultModel: document.getElementById('defaultModel').value,
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      temperature: parseFloat(document.getElementById('temperature').value)
    };

    const response = await chrome.runtime.sendMessage({
      action: 'saveUserSettings',
      data: settings
    });
    
    if (response.success) {
      userSettings = settings;
      showToast('Settings saved successfully!', 'success');
    } else {
      showToast('Error saving settings: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('Error saving settings', 'error');
  }
}

async function saveApiKey() {
  const apiKeyInput = document.getElementById('openaiApiKey');
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showToast('Please enter an API key', 'error');
    return;
  }

  if (!apiKey.startsWith('sk-')) {
    showToast('Invalid API key format', 'error');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveApiKey',
      data: { apiKey }
    });
    
    if (response.success) {
      updateApiKeyStatus(true);
      showToast('API key saved successfully!', 'success');
      apiKeyInput.value = '';
    } else {
      showToast('Error saving API key: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error saving API key:', error);
    showToast('Error saving API key', 'error');
  }
}

async function testApiKey() {
  const apiKeyInput = document.getElementById('openaiApiKey');
  const testBtn = document.getElementById('testApiKey');
  const statusIndicator = document.getElementById('apiKeyStatus');
  
  const apiKey = apiKeyInput.value.trim() || (userSettings.encryptedApiKey ? 'stored' : '');
  
  if (!apiKey) {
    showToast('No API key to test', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  statusIndicator.className = 'status-indicator testing';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testApiKey',
      data: { apiKey: apiKeyInput.value.trim() }
    });
    
    if (response.success) {
      showToast('API key is valid!', 'success');
      updateApiKeyStatus(true);
    } else {
      showToast('API key is invalid', 'error');
      updateApiKeyStatus(false);
    }
  } catch (error) {
    console.error('Error testing API key:', error);
    showToast('Error testing API key', 'error');
    updateApiKeyStatus(false);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

async function removeApiKey() {
  if (!confirm('Are you sure you want to remove your API key?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'removeApiKey'
    });
    
    if (response.success) {
      updateApiKeyStatus(false);
      showToast('API key removed', 'success');
    } else {
      showToast('Error removing API key: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error removing API key:', error);
    showToast('Error removing API key', 'error');
  }
}

function toggleApiKeyVisibility() {
  const apiKeyInput = document.getElementById('openaiApiKey');
  const toggleBtn = document.getElementById('toggleApiKeyVisibility');
  
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleBtn.textContent = '👁️';
  }
}

function updateApiKeyStatus(hasKey) {
  const indicator = document.getElementById('apiKeyStatus');
  const text = document.getElementById('apiKeyStatusText');
  
  if (hasKey) {
    indicator.className = 'status-indicator connected';
    text.textContent = 'API Key Connected';
  } else {
    indicator.className = 'status-indicator disconnected';
    text.textContent = 'No API Key';
  }
}

// Conversation Functions
function filterConversations() {
  const searchTerm = document.getElementById('searchConversations').value.toLowerCase();
  const domainFilter = document.getElementById('filterDomain').value;
  const dateFilter = document.getElementById('filterDate').value;
  const sortBy = document.getElementById('sortBy').value;
  
  filteredConversations = conversations.filter(conv => {
    // Search filter
    const matchesSearch = !searchTerm || 
      (conv.conversationSummary && conv.conversationSummary.toLowerCase().includes(searchTerm)) ||
      (conv.pageTitle && conv.pageTitle.toLowerCase().includes(searchTerm)) ||
      (conv.conversation && conv.conversation.some(msg => 
        msg.content && msg.content.toLowerCase().includes(searchTerm)));
    
    // Domain filter
    const matchesDomain = !domainFilter || conv.domain === domainFilter;
    
    // Date filter
    let matchesDate = true;
    if (dateFilter && conv.updatedAt) {
      const convDate = conv.updatedAt.toDate ? 
        conv.updatedAt.toDate() : new Date(conv.updatedAt);
      const now = new Date();
      
      switch (dateFilter) {
        case 'today':
          matchesDate = convDate.toDateString() === now.toDateString();
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = convDate >= weekAgo;
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchesDate = convDate >= monthAgo;
          break;
        case 'year':
          const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          matchesDate = convDate >= yearAgo;
          break;
      }
    }
    
    return matchesSearch && matchesDomain && matchesDate;
  });
  
  // Sort conversations
  filteredConversations.sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      case 'domain':
        return (a.domain || '').localeCompare(b.domain || '');
      case 'length':
        const aLength = a.conversation ? a.conversation.length : 0;
        const bLength = b.conversation ? b.conversation.length : 0;
        return bLength - aLength;
      case 'newest':
      default:
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }
  });
  
  currentPage = 1;
  renderConversations();
}

function renderConversations() {
  const startIndex = (currentPage - 1) * conversationsPerPage;
  const endIndex = startIndex + conversationsPerPage;
  const pageConversations = filteredConversations.slice(startIndex, endIndex);
  
  if (pageConversations.length === 0) {
    conversationsList.innerHTML = `
      <div class="empty-state">
        <h3>No conversations found</h3>
        <p>Try adjusting your search or filter criteria.</p>
      </div>
    `;
    pagination.style.display = 'none';
    return;
  }
  
  conversationsList.innerHTML = pageConversations.map(conv => `
    <div class="conversation-item" data-id="${conv.id || 'unknown'}">
      <input type="checkbox" class="conversation-checkbox" data-id="${conv.id}">
      <div class="conversation-header">
        <div class="conversation-info">
          <div class="conversation-title">
            ${conv.conversationSummary || conv.pageTitle || 'Untitled Conversation'}
          </div>
          <div class="conversation-meta">
            <span>📅 ${formatTimestamp(conv.updatedAt)}</span>
            <span>🌐 ${conv.domain || 'Unknown'}</span>
            <span>💬 ${conv.conversation ? conv.conversation.length : 0} messages</span>
            <span>📄 ${conv.pageTitle || 'No title'}</span>
          </div>
        </div>
      </div>
      <div class="conversation-preview">
        ${getConversationPreview(conv)}
      </div>
      <div class="conversation-actions">
        <button class="btn btn-small btn-primary" onclick="viewConversation('${conv.id}')">View</button>
        <button class="btn btn-small btn-secondary" onclick="exportConversation('${conv.id}')">Export</button>
        <button class="btn btn-small btn-danger" onclick="deleteConversation('${conv.id}')">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Update pagination
  updatePagination();
  
  // Setup checkbox handlers
  setupCheckboxHandlers();
}

function getConversationPreview(conv) {
  if (!conv.conversation || conv.conversation.length === 0) {
    return 'No messages available';
  }
  
  const firstMessage = conv.conversation[0];
  const preview = firstMessage.content || 'No content';
  return preview.length > 200 ? preview.substring(0, 200) + '...' : preview;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  
  try {
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Unknown';
  }
}

function updatePagination() {
  const totalPages = Math.ceil(filteredConversations.length / conversationsPerPage);
  
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }
  
  pagination.style.display = 'flex';
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function changePage(direction) {
  const totalPages = Math.ceil(filteredConversations.length / conversationsPerPage);
  const newPage = currentPage + direction;
  
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderConversations();
  }
}

function setupCheckboxHandlers() {
  document.querySelectorAll('.conversation-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const convId = e.target.dataset.id;
      if (e.target.checked) {
        selectedConversations.add(convId);
      } else {
        selectedConversations.delete(convId);
      }
      updateSelectionUI();
    });
  });
}

function updateSelectionUI() {
  const selectAllBtn = document.getElementById('selectAll');
  const exportBtn = document.getElementById('exportSelected');
  const deleteBtn = document.getElementById('deleteSelected');
  
  const hasSelection = selectedConversations.size > 0;
  exportBtn.disabled = !hasSelection;
  deleteBtn.disabled = !hasSelection;
  
  selectAllBtn.textContent = selectedConversations.size === filteredConversations.length ? 
    'Deselect All' : 'Select All';
}

function selectAllConversations() {
  const checkboxes = document.querySelectorAll('.conversation-checkbox');
  const shouldSelectAll = selectedConversations.size !== filteredConversations.length;
  
  if (shouldSelectAll) {
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedConversations.add(checkbox.dataset.id);
    });
  } else {
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedConversations.delete(checkbox.dataset.id);
    });
  }
  
  updateSelectionUI();
}

// Global functions for conversation actions
window.viewConversation = (convId) => {
  const conversation = conversations.find(c => c.id === convId);
  if (!conversation) return;
  
  showConversationModal(conversation);
};

window.exportConversation = (convId) => {
  const conversation = conversations.find(c => c.id === convId);
  if (!conversation) return;
  
  exportConversations([conversation]);
};

window.deleteConversation = (convId) => {
  showConfirmModal(
    'Delete Conversation',
    'Are you sure you want to delete this conversation? This action cannot be undone.',
    () => performDeleteConversation(convId)
  );
};

async function exportSelectedConversations() {
  const selected = conversations.filter(c => selectedConversations.has(c.id));
  exportConversations(selected);
}

async function deleteSelectedConversations() {
  if (selectedConversations.size === 0) return;
  
  showConfirmModal(
    'Delete Conversations',
    `Are you sure you want to delete ${selectedConversations.size} conversation(s)? This action cannot be undone.`,
    async () => {
      for (const convId of selectedConversations) {
        await performDeleteConversation(convId);
      }
      selectedConversations.clear();
      updateSelectionUI();
    }
  );
}

function exportConversations(conversationsToExport) {
  const exportData = {
    exported_at: new Date().toISOString(),
    total_conversations: conversationsToExport.length,
    conversations: conversationsToExport
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversations-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast(`Exported ${conversationsToExport.length} conversation(s)`, 'success');
}

async function performDeleteConversation(convId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteConversation',
      data: { conversationId: convId }
    });
    
    if (response.success) {
      // Remove from local arrays
      conversations = conversations.filter(c => c.id !== convId);
      filteredConversations = filteredConversations.filter(c => c.id !== convId);
      
      // Re-render
      renderConversations();
      updateStats();
      
      showToast('Conversation deleted', 'success');
    } else {
      showToast('Error deleting conversation: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting conversation:', error);
    showToast('Error deleting conversation', 'error');
  }
}

// Account Functions
async function updateProfile() {
  const displayName = document.getElementById('displayName').value.trim();
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateProfile',
      data: { displayName }
    });
    
    if (response.success) {
      currentUser.displayName = displayName;
      updateHeader();
      showToast('Profile updated successfully!', 'success');
    } else {
      showToast('Error updating profile: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    showToast('Error updating profile', 'error');
  }
}

async function exportAllData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportData' });
    
    if (response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-assistant-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('Data exported successfully!', 'success');
    } else {
      showToast('Error exporting data: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Error exporting data', 'error');
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate the data structure
    if (!data.conversations || !Array.isArray(data.conversations)) {
      throw new Error('Invalid file format');
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'importData',
      data: data
    });
    
    if (response.success) {
      await loadAllConversations();
      updateStats();
      showToast(`Imported ${data.conversations.length} conversation(s)`, 'success');
    } else {
      showToast('Error importing data: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('Error importing data:', error);
    showToast('Error importing data. Please check the file format.', 'error');
  }
  
  // Reset file input
  event.target.value = '';
}

async function clearHistory() {
  showConfirmModal(
    'Clear All History',
    'Are you sure you want to delete all conversations? This action cannot be undone.',
    async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'clearAllConversations' });
        
        if (response.success) {
          conversations = [];
          filteredConversations = [];
          renderConversations();
          updateStats();
          showToast('All conversations deleted', 'success');
        } else {
          showToast('Error clearing history: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('Error clearing history:', error);
        showToast('Error clearing history', 'error');
      }
    }
  );
}

async function deleteAccount() {
  showConfirmModal(
    'Delete Account',
    'Are you sure you want to delete your account? This will permanently delete all your data and cannot be undone.',
    async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'deleteAccount' });
        
        if (response.success) {
          showToast('Account deleted successfully', 'success');
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          showToast('Error deleting account: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Error deleting account', 'error');
      }
    }
  );
}

// Modal Functions
let currentConversation = null;
let confirmAction = null;

function showConversationModal(conversation) {
  currentConversation = conversation;
  
  const modal = document.getElementById('conversationModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  
  title.textContent = conversation.conversationSummary || conversation.pageTitle || 'Conversation';
  
  // Render conversation messages
  if (conversation.conversation && conversation.conversation.length > 0) {
    body.innerHTML = `
      <div class="conversation-info">
        <p><strong>Page:</strong> ${conversation.pageTitle || 'Unknown'}</p>
        <p><strong>URL:</strong> ${conversation.pageUrl || 'Unknown'}</p>
        <p><strong>Date:</strong> ${formatTimestamp(conversation.updatedAt)}</p>
      </div>
      <div class="conversation-messages">
        ${conversation.conversation.map(msg => `
          <div class="message ${msg.role}">
            <div class="message-header">
              <span class="message-role">${msg.role === 'user' ? 'You' : 'AI'}</span>
              <span class="message-time">${formatTimestamp(msg.timestamp)}</span>
            </div>
            <div class="message-content">${msg.content}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    body.innerHTML = '<p>No messages in this conversation.</p>';
  }
  
  showModal('conversationModal');
}

function showConfirmModal(title, message, action) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmAction = action;
  showModal('confirmModal');
}

function showModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  document.body.style.overflow = '';
}

function exportCurrentConversation() {
  if (currentConversation) {
    exportConversations([currentConversation]);
    hideModal('conversationModal');
  }
}

function deleteCurrentConversation() {
  if (currentConversation) {
    hideModal('conversationModal');
    showConfirmModal(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      () => performDeleteConversation(currentConversation.id)
    );
  }
}

function executeConfirmAction() {
  if (confirmAction) {
    confirmAction();
    confirmAction = null;
  }
  hideModal('confirmModal');
}

// Toast Functions
function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-header">
      <span class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
      <button class="toast-close">&times;</button>
    </div>
    <div class="toast-message">${message}</div>
  `;
  
  container.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  
  // Manual close
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });
}

// Utility Functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function handleHashNavigation() {
  const hash = window.location.hash.substring(1);
  
  if (hash.startsWith('conversation/')) {
    const convId = hash.substring(13);
    const conversation = conversations.find(c => c.id === convId);
    if (conversation) {
      // Switch to conversations section
      document.querySelector('[data-section="conversations"]').click();
      setTimeout(() => showConversationModal(conversation), 500);
    }
  } else if (hash) {
    // Switch to the specified section
    const navItem = document.querySelector(`[data-section="${hash}"]`);
    if (navItem) {
      navItem.click();
    }
  }
}

// Handle auth state changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authStateChanged') {
    if (!request.user) {
      // User signed out, redirect to auth
      showToast('You have been signed out', 'warning');
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/auth.html') });
        window.close();
      }, 2000);
    }
  }
  sendResponse({ success: true });
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  // Clean up any pending operations
  document.body.style.overflow = '';
});