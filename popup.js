/**
 * Reply Guy - Chrome Extension
 * Popup script to handle user settings for the tweet filter
 * Features:
 * - Toggle to enable/disable filtering
 * - Dropdown to select time threshold
 * - Toggle to enable/disable follower count filtering
 * - Input to set minimum follower count threshold
 * - Persistent settings via Chrome storage
 */

document.addEventListener('DOMContentLoaded', function() {
  const enableFilterCheckbox = document.getElementById('enableFilter');
  const maxAgeSelect = document.getElementById('maxAge');
  const enableFollowerFilterCheckbox = document.getElementById('enableFollowerFilter');
  const minFollowersInput = document.getElementById('minFollowers');
  const followerContainer = document.getElementById('followerContainer');
  const statusElement = document.getElementById('status');
  
  // Load saved settings
  chrome.storage.sync.get(['enabled', 'maxAge', 'followerFilterEnabled', 'minFollowers'], function(result) {
    try {
      // Set default values if not found in storage
      enableFilterCheckbox.checked = result.enabled === undefined ? true : result.enabled;
      
      if (result.maxAge) {
        maxAgeSelect.value = result.maxAge;
      } else {
        maxAgeSelect.value = '120'; // Default to 2 hours
      }

      // Set follower filter settings
      enableFollowerFilterCheckbox.checked = result.followerFilterEnabled === true;
      
      if (result.minFollowers) {
        minFollowersInput.value = result.minFollowers;
      } else {
        minFollowersInput.value = '2000'; // Default minimum followers
      }
      
      // Show/hide follower input based on checkbox state
      followerContainer.style.display = enableFollowerFilterCheckbox.checked ? 'block' : 'none';
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use defaults on error
      enableFilterCheckbox.checked = true;
      maxAgeSelect.value = '120';
      enableFollowerFilterCheckbox.checked = false;
      minFollowersInput.value = '2000';
      followerContainer.style.display = 'none';
    }
  });

  // Save toggle state
  enableFilterCheckbox.addEventListener('change', function() {
    try {
      chrome.storage.sync.set({ enabled: this.checked }, showSaveStatus);
    } catch (error) {
      console.error('Error saving enabled state:', error);
      showSaveError();
    }
  });

  // Save time cutoff
  maxAgeSelect.addEventListener('change', function() {
    try {
      chrome.storage.sync.set({ maxAge: parseInt(this.value) }, showSaveStatus);
    } catch (error) {
      console.error('Error saving max age:', error);
      showSaveError();
    }
  });

  // Toggle follower filter
  enableFollowerFilterCheckbox.addEventListener('change', function() {
    try {
      followerContainer.style.display = this.checked ? 'block' : 'none';
      chrome.storage.sync.set({ followerFilterEnabled: this.checked }, showSaveStatus);
    } catch (error) {
      console.error('Error saving follower filter state:', error);
      showSaveError();
    }
  });

  // Save minimum followers
  minFollowersInput.addEventListener('change', function() {
    try {
      const value = parseInt(this.value);
      // Ensure the value is a positive number
      if (isNaN(value) || value < 0) {
        this.value = '0';
        chrome.storage.sync.set({ minFollowers: 0 }, showSaveStatus);
      } else {
        chrome.storage.sync.set({ minFollowers: value }, showSaveStatus);
      }
    } catch (error) {
      console.error('Error saving min followers:', error);
      showSaveError();
    }
  });

  function showSaveStatus() {
    statusElement.textContent = 'Settings saved!';
    statusElement.style.opacity = '1';
    statusElement.style.backgroundColor = '#E8F5FD';
    statusElement.style.color = '#1D9BF0';
    
    setTimeout(() => {
      statusElement.style.opacity = '0';
    }, 1500);
  }
  
  function showSaveError() {
    statusElement.textContent = 'Error saving settings!';
    statusElement.style.opacity = '1';
    statusElement.style.backgroundColor = '#FFEBED';
    statusElement.style.color = '#F4212E';
    
    setTimeout(() => {
      statusElement.style.opacity = '0';
    }, 3000);
  }
});