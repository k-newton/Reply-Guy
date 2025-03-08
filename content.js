/**
 * Reply Guy - Chrome Extension
 * Filters tweets on X.com's For You feed based on age and follower count
 * 
 * Changes made:
 * - Switched from inline styles to CSS classes for hiding tweets
 * - Added global CSS styles with !important to ensure immediate hiding
 * - Modified MutationObserver to process tweets earlier in render cycle
 * - Implemented preemptive filtering approach
 * - Optimized tweet processing to reduce flickering
 * - Added logic to filter out replies when parent post is filtered by age
 * - Updated default follower cutoff from 100 to 2000
 * - Added filtering for "Show more replies" links of filtered conversations
 * - Enhanced reply detection for standalone replies in the feed
 * 
 * Features:
 * - Only operates on the main For You feed, not individual posts
 * - Hides tweets older than a customizable time threshold (default: 2 hours)
 * - Hides tweets from users with follower counts below a customizable threshold
 * - Shows real-time counter of filtered and displayed tweets
 * - Manually loads more tweets only when button is clicked
 * - Prevents any automatic scrolling
 */

// Default settings: 120 minutes = 2 hours, enabled by default
let settings = { 
  maxAge: 120, 
  enabled: true,
  followerFilterEnabled: false,
  minFollowers: 2000
};

let statsCounter = { hidden: 0, shown: 0, hiddenByFollowers: 0 };
let observer = null;
let isLoading = false;
let lastScrollPosition = 0;
let scrollStabilizer = null;
let filterDebounceTimer = null;
let filteredParentIds = new Set(); // Track filtered parent posts by their IDs
let allFilteredTweets = new Set(); // Track all filtered tweet IDs for more persistent filtering

// Load stored settings from chrome.storage on startup
chrome.storage.sync.get(['maxAge', 'enabled', 'followerFilterEnabled', 'minFollowers'], function(result) {
  if (result.maxAge) settings.maxAge = result.maxAge;
  if (typeof result.enabled === 'boolean') settings.enabled = result.enabled;
  if (typeof result.followerFilterEnabled === 'boolean') settings.followerFilterEnabled = result.followerFilterEnabled;
  if (typeof result.minFollowers === 'number') settings.minFollowers = result.minFollowers;
  
  initializeFilter();
});

// Listen for settings changes to update dynamically
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.maxAge) settings.maxAge = changes.maxAge.newValue;
  if (changes.enabled) settings.enabled = changes.enabled.newValue;
  if (changes.followerFilterEnabled) settings.followerFilterEnabled = changes.followerFilterEnabled.newValue;
  if (changes.minFollowers) settings.minFollowers = changes.minFollowers.newValue;
  
  // Check if we're on the For You feed
  if (isForYouFeed()) {
    if (settings.enabled) {
      injectFilterStyles(); // Ensure styles are present
      debouncedFilterTweets();
      setupObserver();
    } else {
      // If disabled, show all tweets and remove counter
      showAllTweets();
      removeStatsCounter();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  } else {
    // Clean up if we're not on the For You feed
    removeStatsCounter();
    removeLoadMoreButton();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
});

// Inject CSS styles for filtering tweets
function injectFilterStyles() {
  // Create a style element if it doesn't exist
  let styleEl = document.getElementById('reply-guy-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'reply-guy-styles';
    document.head.appendChild(styleEl);
  }
  
  // Define CSS rules for hiding filtered tweets with !important to ensure they apply immediately
  styleEl.textContent = `
    .reply-guy-filtered-tweet {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      z-index: -9999 !important;
    }
    
    /* Prevent transition effects that could cause flickering */
    [data-testid="tweet"] {
      transition: none !important;
    }
  `;
}

function isForYouFeed() {
  // More precise check to ensure we're only on the main For You feed
  // Exclude individual post pages (which have /status/ in the URL)
  if (window.location.pathname.includes('/status/')) {
    return false;
  }
  
  // Also exclude other sections like notifications, messages, etc.
  if (window.location.pathname.match(/^\/(explore|notifications|messages|i|lists|bookmarks|verified|tos|privacy)/)) {
    return false;
  }
  
  // Now check for the actual For You feed
  // Main feed is either / or /home
  if (window.location.pathname === '/' || window.location.pathname === '/home') {
    // Extra check: look for the "For you" tab being selected
    const forYouTab = document.querySelector('a[aria-selected="true"][role="tab"]:not([aria-selected="false"])');
    return forYouTab && forYouTab.textContent.toLowerCase().includes('for you');
  }
  
  return false;
}

function initializeFilter() {
  // Only proceed if we're on the For You feed and filter is enabled
  if (!isForYouFeed() || !settings.enabled) {
    // Clean up if we're not on the For You feed
    removeStatsCounter();
    removeLoadMoreButton();
    return;
  }

  // Inject CSS styles for filtering
  injectFilterStyles();

  // Pre-scan for tweets that need filtering
  preScanForTweetsToFilter();

  setupScrollProtection();
  setupObserver();
  
  // Perform initial filtering
  filterTweets();

  // Add stats counter to the page
  addStatsCounter();
  
  // Add load more button
  addLoadMoreButton();
}

// Set up scroll protection to prevent unwanted scrolling
function setupScrollProtection() {
  // Store initial scroll position
  lastScrollPosition = window.scrollY;
  
  // Monitor for unexpected scroll changes and reset them
  window.addEventListener('scroll', function() {
    // If we're not in a loading state and the scroll changes unexpectedly
    if (!isLoading) {
      clearTimeout(scrollStabilizer);
      scrollStabilizer = setTimeout(() => {
        // Check if there appears to be an auto-scroll happening
        const currentScroll = window.scrollY;
        const scrollDifference = currentScroll - lastScrollPosition;
        
        // If scroll has changed significantly in a way that looks automatic
        if (Math.abs(scrollDifference) > 200 && !isUserScrolling()) {
          // Reset to last known good position
          window.scrollTo(0, lastScrollPosition);
        } else {
          // Update our recorded position for normal scrolling
          lastScrollPosition = currentScroll;
        }
      }, 100);
    }
  }, { passive: true });
}

// Simple detection of likely user-initiated scrolling
let lastScrollTime = 0;
let isUserInitiated = false;

function isUserScrolling() {
  const now = Date.now();
  if (now - lastScrollTime < 1000) {
    return isUserInitiated;
  }
  isUserInitiated = false;
  return false;
}

// Track user-initiated scrolling events
window.addEventListener('wheel', function() {
  lastScrollTime = Date.now();
  isUserInitiated = true;
}, { passive: true });

window.addEventListener('touchmove', function() {
  lastScrollTime = Date.now();
  isUserInitiated = true;
}, { passive: true });

window.addEventListener('keydown', function(e) {
  // Arrow keys, Page Up/Down, Space, Home, End
  if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) {
    lastScrollTime = Date.now();
    isUserInitiated = true;
  }
}, { passive: true });

function setupObserver() {
  // Clean up existing observer if any
  if (observer) observer.disconnect();
  
  // Set up MutationObserver to process dynamically loaded tweets
  observer = new MutationObserver((mutations) => {
    // First check if we're still on the For You feed
    if (!isForYouFeed()) {
      observer.disconnect();
      observer = null;
      removeStatsCounter();
      removeLoadMoreButton();
      return;
    }
    
    let needsFiltering = false;
    let newTweets = [];
    let showMoreLinksChanged = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Process new nodes immediately before they're fully rendered
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this node is a tweet or contains tweets
            if (node.dataset && node.dataset.testid === 'tweet') {
              newTweets.push(node);
              needsFiltering = true;
            } else {
              // Look for tweets within added node
              const tweets = node.querySelectorAll('[data-testid="tweet"]');
              if (tweets.length > 0) {
                newTweets.push(...tweets);
                needsFiltering = true;
              }
              
              // Also check if this might be a "Show more replies" link
              if (
                node.textContent && (
                  (node.textContent.toLowerCase().includes('show') && node.textContent.toLowerCase().includes('more') && node.textContent.toLowerCase().includes('repl')) ||
                  (node.textContent.toLowerCase().includes('view') && node.textContent.toLowerCase().includes('more') && node.textContent.toLowerCase().includes('repl'))
                )
              ) {
                showMoreLinksChanged = true;
              }
            }
          }
        }
      }
    }
    
    // Immediately process new tweets to prevent flickering
    if (newTweets.length > 0) {
      processTweetsImmediately(newTweets);
    }
    
    // If we detected any show more links, try to hide those that should be hidden
    if (showMoreLinksChanged) {
      setTimeout(hideShowMoreRepliesLinks, 100);
    }
    
    // Still perform a full filter with debounce for consistency
    if (needsFiltering || showMoreLinksChanged) {
      debouncedFilterTweets();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Immediately process new tweets before they're fully rendered
function processTweetsImmediately(tweets) {
  // First, identify tweet conversation groups and parents
  const conversationGroups = identifyConversationGroups(tweets);
  
  // Process each tweet
  tweets.forEach(tweet => {
    // Default to showing the tweet
    let shouldFilter = false;
    let filterReason = '';
    
    // Get tweet ID for tracking
    const tweetId = getTweetId(tweet);
    
    // Check if we've already decided to filter this specific tweet
    if (tweetId && allFilteredTweets.has(tweetId)) {
      shouldFilter = true;
      filterReason = 'previously_filtered';
    } else {
      // Check if this is a reply to a filtered parent
      const conversationId = getTweetConversationId(tweet);
      const isReply = isTweetReply(tweet);
      
      if (isReply && ((conversationId && filteredParentIds.has(conversationId)) || isReplyingToFilteredUser(tweet))) {
        // Filter this reply because its parent is filtered
        shouldFilter = true;
        filterReason = 'parent_filtered';
        
        // Remember this tweet ID for future filtering
        if (tweetId) {
          allFilteredTweets.add(tweetId);
        }
      } else {
        // Check time filter if enabled
        const timestamp = tweet.querySelector('time');
        if (timestamp) {
          try {
            const tweetTime = parseTweetTime(timestamp);
            const cutoffTime = new Date(Date.now() - settings.maxAge * 60000);

            // If this tweet is too old
            if (tweetTime <= cutoffTime) {
              shouldFilter = true;
              filterReason = 'time';
              
              // If this is a parent tweet, remember its ID to filter replies
              if (!isReply) {
                if (tweetId) {
                  filteredParentIds.add(tweetId);
                  allFilteredTweets.add(tweetId);
                }
                
                if (conversationId) {
                  filteredParentIds.add(conversationId);
                }
              } else {
                // Also track replies that are filtered by time
                if (tweetId) {
                  allFilteredTweets.add(tweetId);
                }
              }
            }
          } catch (error) {
            console.error('Error processing tweet time:', error);
          }
        }

        // Check follower count filter if enabled and the tweet is still visible
        if (!shouldFilter && settings.followerFilterEnabled) {
          try {
            const followerCount = parseFollowerCount(tweet);
            if (followerCount !== null && followerCount < settings.minFollowers) {
              shouldFilter = true;
              filterReason = 'followers';
              
              // Track this tweet
              if (tweetId) {
                allFilteredTweets.add(tweetId);
              }
            }
          } catch (error) {
            console.error('Error processing follower count:', error);
          }
        }
      }
    }

    // Apply filtering using CSS class for immediate effect
    if (shouldFilter) {
      tweet.classList.add('reply-guy-filtered-tweet');
      if (filterReason === 'followers') {
        statsCounter.hiddenByFollowers++;
      }
      statsCounter.hidden++;
    } else {
      tweet.classList.remove('reply-guy-filtered-tweet');
      // Remove from filtered set if it was there
      if (tweetId) {
        allFilteredTweets.delete(tweetId);
      }
      statsCounter.shown++;
    }
  });
  
  // Try to also hide any "Show more replies" links for filtered conversations
  setTimeout(hideShowMoreRepliesLinks, 100);
  
  // Update the stats counter
  updateStatsCounter();
}

// Helper function to identify conversation groups in a set of tweets
function identifyConversationGroups(tweets) {
  const groups = new Map();
  
  tweets.forEach(tweet => {
    const conversationId = getTweetConversationId(tweet);
    if (conversationId) {
      if (!groups.has(conversationId)) {
        groups.set(conversationId, []);
      }
      groups.get(conversationId).push(tweet);
    }
  });
  
  return groups;
}

// Helper function to get a tweet's conversation ID with enhanced detection
function getTweetConversationId(tweet) {
  // Method 1: Try to find conversation ID from data attributes
  const conversationId = tweet.getAttribute('data-conversation-id') || 
                         tweet.getAttribute('data-converation-id') || 
                         tweet.getAttribute('data-tweet-conversation-id');
  
  if (conversationId) return conversationId;
  
  // Method 2: Look for conversation link in the tweet
  const conversationLinks = tweet.querySelectorAll('a[href*="/status/"]');
  for (const link of conversationLinks) {
    const href = link.getAttribute('href');
    // Avoid links to the tweet itself by checking context
    if (link.closest('[data-testid="caret"]')) continue;
    if (link.closest('[data-testid="card.wrapper"]')) continue;
    
    const match = href.match(/\/status\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Method 3: Try to extract from thread context
  const threadParent = tweet.closest('[data-testid="cellInnerDiv"]');
  if (threadParent) {
    const threadLinks = threadParent.querySelectorAll('a[href*="/status/"]');
    for (const link of threadLinks) {
      if (link.closest('[data-testid="tweet"]') === tweet) continue; // Skip links in the current tweet
      
      const href = link.getAttribute('href');
      const match = href.match(/\/status\/(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  // Method 4: Look for "Replying to" links
  const replyingToSpan = Array.from(tweet.querySelectorAll('span')).find(span => 
    span.textContent && span.textContent.toLowerCase().includes('replying to')
  );
  
  if (replyingToSpan) {
    const closestLink = replyingToSpan.closest('div').querySelector('a[href*="/"]');
    if (closestLink) {
      // Check if this user has recent tweets we filtered
      const username = closestLink.textContent.replace('@', '');
      // Look for filtered tweets from this user
      const filteredFromUser = document.querySelectorAll('[data-testid="tweet"].reply-guy-filtered-tweet');
      for (const filteredTweet of filteredFromUser) {
        const userElement = filteredTweet.querySelector('a[role="link"][href^="/"]');
        if (userElement && userElement.getAttribute('href').replace(/^\//, '').split('/')[0] === username) {
          const filteredId = getTweetId(filteredTweet);
          if (filteredId) return filteredId;
        }
      }
    }
  }
  
  return null;
}

// Helper function to get a tweet's ID
function getTweetId(tweet) {
  // Try to find tweet ID from data attributes
  const tweetId = tweet.getAttribute('data-tweet-id') || 
                 tweet.getAttribute('data-status-id');
  
  if (tweetId) return tweetId;
  
  // Look for status link
  const statusLink = tweet.querySelector('a[href*="/status/"]');
  if (statusLink) {
    const href = statusLink.getAttribute('href');
    const match = href.match(/\/status\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Helper function to determine if a tweet is a reply
function isTweetReply(tweet) {
  // Method 1: Check for presence of reply indicator elements
  const replyIndicator = tweet.querySelector('[data-testid="reply"]') || 
                         tweet.querySelector('[data-testid="replyLine"]') ||
                         tweet.querySelector('[aria-label*="reply"]');
  
  if (replyIndicator) return true;
  
  // Method 2: Check for a "Replying to" text
  const replyingToText = Array.from(tweet.querySelectorAll('span')).find(span => 
    span.textContent && (
      span.textContent.toLowerCase().includes('replying to') || 
      span.textContent.toLowerCase().includes('replying')
    )
  );
  
  if (replyingToText) return true;

  // Method 3: Look for reply context indicators
  const hasReplyContext = tweet.querySelector('[href*="/status/"][role="link"]:not([href$="/photo/1"])');
  if (hasReplyContext) {
    // Exclude links that are just to the tweet itself
    const tweetId = getTweetId(tweet);
    if (tweetId) {
      const isLinkToSelf = hasReplyContext.getAttribute('href').includes(tweetId);
      if (!isLinkToSelf) return true;
    } else {
      return true;
    }
  }
  
  // Method 4: Check the tweet structure - if it's indented or has special styling
  const isIndented = tweet.classList.contains('r-indented') || 
                    (tweet.parentElement && tweet.parentElement.classList.contains('r-indented'));
  
  if (isIndented) return true;

  // Method 5: Check for quoted text elements which often indicate a reply
  const quotedText = tweet.querySelector('[role="blockquote"]') || 
                     tweet.querySelector('.r-1777fci');  // CSS class often used for quoted text
  
  if (quotedText) return true;

  // Method 6: Try to infer from context whether this looks like a reply
  const tweetText = tweet.textContent.trim().toLowerCase();
  if (tweetText.startsWith('@') || 
      tweetText.includes('no, ') || 
      tweetText.includes('yes, ') || 
      tweetText.includes('i agree') || 
      tweetText.includes('disagree') ||
      tweetText.includes('there was a time when')) {
    return true;
  }

  return false;
}

// Helper to check if a tweet is replying to a user with filtered tweets
function isReplyingToFilteredUser(tweet) {
  // Find "Replying to @username" text
  const replyingToSpan = Array.from(tweet.querySelectorAll('span')).find(span => 
    span.textContent && span.textContent.toLowerCase().includes('replying to')
  );
  
  if (replyingToSpan) {
    // Find the username being replied to
    const closestLink = replyingToSpan.closest('div').querySelector('a[href*="/"]');
    if (closestLink) {
      const username = closestLink.textContent.replace('@', '').trim().toLowerCase();
      
      // Look for filtered tweets from this user
      const allTweets = document.querySelectorAll('[data-testid="tweet"]');
      for (const t of allTweets) {
        if (t.classList.contains('reply-guy-filtered-tweet')) {
          // This is a filtered tweet, check who posted it
          const userElement = t.querySelector('a[role="link"][href^="/"]');
          if (userElement) {
            const tweetUsername = userElement.getAttribute('href').replace(/^\//, '').split('/')[0].toLowerCase();
            if (tweetUsername === username) {
              return true;
            }
          }
        }
      }
    }
  }
  
  return false;
}

// Debounce the filter to avoid frequent refiltering
function debouncedFilterTweets() {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    if (!isLoading && isForYouFeed()) {
      filterTweets();
    }
  }, 300);
}

function filterTweets() {
  // Double-check we're on the For You feed before filtering
  if (!isForYouFeed()) {
    return;
  }
  
  // Store current scroll position before filtering
  const scrollBefore = window.scrollY;
  
  // Reset counters
  statsCounter.hidden = 0;
  statsCounter.shown = 0;
  statsCounter.hiddenByFollowers = 0;

  // Find all tweet elements using a stable selector
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  
  // First, identify parent tweets that are too old
  tweets.forEach(tweet => {
    if (!isTweetReply(tweet)) { // It's a parent tweet
      const timestamp = tweet.querySelector('time');
      if (timestamp) {
        try {
          const tweetTime = parseTweetTime(timestamp);
          const cutoffTime = new Date(Date.now() - settings.maxAge * 60000);
          
          if (tweetTime <= cutoffTime) {
            // This parent is too old - remember its ID
            const tweetId = getTweetId(tweet);
            const conversationId = getTweetConversationId(tweet);
            
            if (tweetId) {
              filteredParentIds.add(tweetId);
              allFilteredTweets.add(tweetId);
            }
            
            if (conversationId) {
              filteredParentIds.add(conversationId);
            }
          }
        } catch (error) {
          console.error('Error processing parent tweet time:', error);
        }
      }
    }
  });
  
  // Now filter all tweets including replies to filtered parents
  let visibleCount = 0;
  tweets.forEach(tweet => {
    // Default to showing the tweet
    let shouldFilter = false;
    let filterReason = '';
    
    // Get tweet ID for tracking
    const tweetId = getTweetId(tweet);
    
    // Check if we've already decided to filter this specific tweet
    if (tweetId && allFilteredTweets.has(tweetId)) {
      shouldFilter = true;
      filterReason = 'previously_filtered';
    } else {
      // Check if this is a reply to a filtered parent
      const isReply = isTweetReply(tweet);
      const conversationId = getTweetConversationId(tweet);
      
      if (isReply && ((conversationId && filteredParentIds.has(conversationId)) || isReplyingToFilteredUser(tweet))) {
        // Filter this reply because its parent is filtered
        shouldFilter = true;
        filterReason = 'parent_filtered';
        
        // Remember this tweet ID for future filtering
        if (tweetId) {
          allFilteredTweets.add(tweetId);
        }
      } else {
        // Check time filter if enabled
        const timestamp = tweet.querySelector('time');
        if (timestamp) {
          try {
            const tweetTime = parseTweetTime(timestamp);
            const cutoffTime = new Date(Date.now() - settings.maxAge * 60000);

            if (tweetTime <= cutoffTime) {
              shouldFilter = true;
              filterReason = 'time';
              
              // If this is a parent tweet, add to filtered parents
              if (!isReply) {
                if (tweetId) {
                  filteredParentIds.add(tweetId);
                  allFilteredTweets.add(tweetId);
                }
                
                if (conversationId) {
                  filteredParentIds.add(conversationId);
                }
              } else {
                // Also track replies that are filtered by time
                if (tweetId) {
                  allFilteredTweets.add(tweetId);
                }
              }
            }
          } catch (error) {
            console.error('Error processing tweet time:', error);
          }
        }

        // Check follower count filter if enabled and the tweet is still visible
        if (!shouldFilter && settings.followerFilterEnabled) {
          try {
            const followerCount = parseFollowerCount(tweet);
            if (followerCount !== null && followerCount < settings.minFollowers) {
              shouldFilter = true;
              filterReason = 'followers';
              
              // Track this tweet
              if (tweetId) {
                allFilteredTweets.add(tweetId);
              }
            }
          } catch (error) {
            console.error('Error processing follower count:', error);
          }
        }
      }
    }

    // Apply filtering using CSS class instead of inline styles
    if (shouldFilter) {
      tweet.classList.add('reply-guy-filtered-tweet');
      if (filterReason === 'followers') {
        statsCounter.hiddenByFollowers++;
      }
      statsCounter.hidden++;
    } else {
      tweet.classList.remove('reply-guy-filtered-tweet');
      // Remove from filtered set if it was there
      if (tweetId) {
        allFilteredTweets.delete(tweetId);
      }
      visibleCount++;
      statsCounter.shown++;
    }
  });

  // Hide the "Show more replies" links for filtered conversations
  hideShowMoreRepliesLinks();

  // Update the load more button visibility
  updateLoadMoreButton(visibleCount);

  // Update the on-screen counter
  updateStatsCounter();
  
  // Restore scroll position to prevent unwanted jumping
  if (!isLoading && Math.abs(window.scrollY - scrollBefore) > 50) {
    window.scrollTo(0, scrollBefore);
  }
  
  // Update our saved scroll position
  lastScrollPosition = window.scrollY;
}

function updateLoadMoreButton(visibleCount) {
  const loadMoreBtn = document.getElementById('reply-guy-load-more');
  if (loadMoreBtn) {
    if (visibleCount < 10) {
      loadMoreBtn.style.display = 'block';
      loadMoreBtn.textContent = `Load More (${visibleCount} visible)`;
    } else {
      loadMoreBtn.style.display = 'none';
    }
  }
}

function addLoadMoreButton() {
  removeLoadMoreButton(); // Remove any existing button
  
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.id = 'reply-guy-load-more';
  loadMoreBtn.textContent = 'Load More Tweets';
  loadMoreBtn.style = `
    position: fixed;
    bottom: 70px;
    right: 20px;
    background: #1D9BF0;
    color: white;
    padding: 10px 15px;
    border-radius: 20px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-weight: bold;
    font-size: 14px;
    border: none;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    display: none;
  `;
  
  loadMoreBtn.addEventListener('click', function() {
    loadMoreTweets();
  });
  
  document.body.appendChild(loadMoreBtn);
}

function removeLoadMoreButton() {
  const loadMoreBtn = document.getElementById('reply-guy-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.remove();
  }
}

function loadMoreTweets() {
  if (isLoading || !isForYouFeed()) return;
  
  isLoading = true;
  const loadMoreBtn = document.getElementById('reply-guy-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.textContent = 'Loading...';
    loadMoreBtn.disabled = true;
  }
  
  // Capture current scroll position - this is an intentional user action
  lastScrollPosition = window.scrollY;
  
  // Record the current count of tweets
  const tweetCountBefore = document.querySelectorAll('[data-testid="tweet"]').length;
  
  // Manually load content by scrolling slightly
  const targetScroll = window.scrollY + (window.innerHeight * 0.75);
  window.scrollTo({
    top: targetScroll
  });
  
  // Set a timeout to check if new tweets loaded
  setTimeout(() => {
    const tweetCountAfter = document.querySelectorAll('[data-testid="tweet"]').length;
    
    // If no new tweets loaded, scroll a bit more
    if (tweetCountAfter <= tweetCountBefore) {
      window.scrollTo({
        top: window.scrollY + (window.innerHeight * 0.5)
      });
      
      // Check again after a short delay
      setTimeout(() => {
        // Now restore position and filter
        window.scrollTo({
          top: lastScrollPosition
        });
        
        setTimeout(() => {
          filterTweets();
          isLoading = false;
          
          if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Load More Tweets';
          }
        }, 300);
      }, 1000);
    } else {
      // Restore position and filter
      window.scrollTo({
        top: lastScrollPosition
      });
      
      setTimeout(() => {
        filterTweets();
        isLoading = false;
        
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Load More Tweets';
        }
      }, 300);
    }
  }, 1500);
}

function showAllTweets() {
  // Show all tweets when filter is disabled
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  tweets.forEach(tweet => {
    tweet.classList.remove('reply-guy-filtered-tweet');
  });
  
  removeLoadMoreButton();
}

function parseTweetTime(timeElement) {
  // Use datetime attribute if available (most reliable)
  const dateTimeAttr = timeElement.getAttribute('datetime');
  if (dateTimeAttr) return new Date(dateTimeAttr);

  // Fallback to parsing text content
  const timeText = timeElement.textContent.trim().toLowerCase();
  const now = new Date();

  if (timeText.includes('now') || timeText.includes('just now')) {
    return now;
  } else if (timeText.includes('m')) {
    const minutes = parseInt(timeText);
    return new Date(now - minutes * 60000);
  } else if (timeText.includes('h')) {
    const hours = parseInt(timeText);
    return new Date(now - hours * 3600000);
  } else if (timeText.includes('d')) {
    const days = parseInt(timeText);
    return new Date(now - days * 86400000);
  } else if (timeText.includes('s')) {
    const seconds = parseInt(timeText);
    return new Date(now - seconds * 1000);
  } else {
    // Try to parse as absolute date
    try {
      const parsedDate = new Date(timeText);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    } catch (e) {
      // Parsing failed, assume it's old
    }
    return new Date(0); // Very old date as fallback
  }
}

function parseFollowerCount(tweetElement) {
  try {
    // First get the link to the profile
    const profileLink = tweetElement.querySelector('a[role="link"][href^="/"]');
    if (!profileLink) return null;

    // Extract the username from the href attribute
    const username = profileLink.getAttribute('href').replace(/^\//, '').split('/')[0];
    if (!username) return null;

    // Check if we've already loaded the profile
    const existingProfileData = document.querySelector(`[data-testid="UserProfileHeader_Items_${username}"]`);
    if (existingProfileData) {
      return extractFollowerCountFromText(existingProfileData.textContent);
    }

    // If we can't find the profile data directly, we'll have to fetch it by opening a popup
    // Attempt to find the follower count from hover card popup (appears on profile hover)
    const hoverCard = document.querySelector('[data-testid="HoverCard"]');
    if (hoverCard) {
      const followerText = Array.from(hoverCard.querySelectorAll('span')).find(span => 
        span.textContent && span.textContent.includes('Followers'));
      
      if (followerText) {
        return extractFollowerCountFromText(followerText.textContent);
      }
    }

    // If all else fails, we can't determine the follower count
    return null;
  } catch (error) {
    console.error('Error parsing follower count:', error);
    return null;
  }
}

function extractFollowerCountFromText(text) {
  if (!text) return null;
  
  try {
    // Match patterns like "1.2K Followers", "12M Followers", "123 Followers"
    const followerMatch = text.match(/(\d+(?:\.\d+)?)\s*([KkMmBb]?)\s*(?:Follower|Followers)/);
    
    if (followerMatch) {
      let count = parseFloat(followerMatch[1]);
      const multiplier = followerMatch[2].toLowerCase();
      
      // Apply multiplier based on suffix (K, M, B)
      if (multiplier === 'k') count *= 1000;
      else if (multiplier === 'm') count *= 1000000;
      else if (multiplier === 'b') count *= 1000000000;
      
      return Math.floor(count);
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting follower count from text:', error);
    return null;
  }
}

function addStatsCounter() {
  // Remove any existing counter first
  removeStatsCounter();
  
  const counterDiv = document.createElement('div');
  counterDiv.id = 'reply-guy-counter';
  counterDiv.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #1D9BF0;
    color: white;
    padding: 8px 12px;
    border-radius: 20px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-weight: bold;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  `;
  document.body.appendChild(counterDiv);
  updateStatsCounter();
}

function updateStatsCounter() {
  const counterElement = document.getElementById('reply-guy-counter');
  if (counterElement) {
    let counterText = `Shown: ${statsCounter.shown} | Hidden: ${statsCounter.hidden}`;
    
    // Add follower filter stats if enabled
    if (settings.followerFilterEnabled) {
      counterText += ` (${statsCounter.hiddenByFollowers} by followers)`;
    }
    
    counterElement.textContent = counterText;
  }
}

function removeStatsCounter() {
  const counterDiv = document.getElementById('reply-guy-counter');
  if (counterDiv) {
    counterDiv.remove();
  }
}

// Handle URL changes for SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    
    // Stop any pending operations
    isLoading = false;
    clearTimeout(filterDebounceTimer);
    
    // Clean up old observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    // Check if we need to reinitialize
    setTimeout(() => {
      if (isForYouFeed() && settings.enabled) {
        initializeFilter();
      } else {
        // Clean up if we're not on the For You feed
        removeStatsCounter();
        removeLoadMoreButton();
      }
    }, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Block X's auto-scroll behavior by overriding scrollTo and scrollBy
function preventAutoScroll() {
  const originalScrollTo = window.scrollTo;
  const originalScrollBy = window.scrollBy;
  
  window.scrollTo = function() {
    if (isLoading || isUserScrolling()) {
      return originalScrollTo.apply(this, arguments);
    } else {
      // console.log("Blocked auto scrollTo");
      return;
    }
  };
  
  window.scrollBy = function() {
    if (isLoading || isUserScrolling()) {
      return originalScrollBy.apply(this, arguments);
    } else {
      // console.log("Blocked auto scrollBy");
      return;
    }
  };
}

// Initial setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    preventAutoScroll();
    setTimeout(() => {
      if (isForYouFeed() && settings.enabled) {
        initializeFilter();
      }
    }, 1000);
  });
} else {
  preventAutoScroll();
  setTimeout(() => {
    if (isForYouFeed() && settings.enabled) {
      initializeFilter();
    }
  }, 1000);
}

// Function to find and hide "Show more replies" links
function hideShowMoreRepliesLinks() {
  // Find all "Show more replies" links
  // These can appear in various forms, so we need to look for multiple patterns
  
  // Method 1: Look for links with specific text content
  const allLinks = document.querySelectorAll('a[role="link"]');
  allLinks.forEach(link => {
    const linkText = link.textContent.toLowerCase();
    if (
      (linkText.includes('show') && linkText.includes('more') && linkText.includes('repl')) || 
      (linkText.includes('view') && linkText.includes('more') && linkText.includes('repl'))
    ) {
      // Check if this link is part of a filtered conversation
      const closestTweet = findClosestTweet(link);
      if (closestTweet) {
        const conversationId = getTweetConversationId(closestTweet);
        if (conversationId && filteredParentIds.has(conversationId)) {
          // This "Show more replies" link belongs to a filtered conversation
          const linkContainer = findLinkContainer(link);
          if (linkContainer) {
            linkContainer.classList.add('reply-guy-filtered-tweet');
          } else {
            link.classList.add('reply-guy-filtered-tweet');
          }
        }
      }
    }
  });
  
  // Method 2: Look for specific UI components that might be "Show more replies"
  const possibleShowMoreElements = document.querySelectorAll('[data-testid="cellInnerDiv"]');
  possibleShowMoreElements.forEach(element => {
    // Check if this element contains text about showing more replies
    const elementText = element.textContent.toLowerCase();
    if (
      (elementText.includes('show') && elementText.includes('more') && elementText.includes('repl')) || 
      (elementText.includes('view') && elementText.includes('more') && elementText.includes('repl'))
    ) {
      // Check if this is part of a filtered conversation
      const closestTweet = findClosestTweet(element);
      if (closestTweet) {
        const conversationId = getTweetConversationId(closestTweet);
        if (conversationId && filteredParentIds.has(conversationId)) {
          element.classList.add('reply-guy-filtered-tweet');
        }
      }
    }
  });
}

// Helper function to find the closest tweet to an element
function findClosestTweet(element) {
  // Try to find the closest tweet container
  let current = element;
  while (current && current !== document.body) {
    // Check if current element is a tweet
    if (current.getAttribute('data-testid') === 'tweet') {
      return current;
    }
    
    // Check if current element contains a tweet
    const tweet = current.querySelector('[data-testid="tweet"]');
    if (tweet) {
      return tweet;
    }
    
    current = current.parentElement;
  }
  
  // If we couldn't find a direct parent/ancestor tweet, 
  // look for the closest tweet above this element
  let previousElement = element.previousElementSibling;
  while (previousElement) {
    if (previousElement.getAttribute('data-testid') === 'tweet' || 
        previousElement.querySelector('[data-testid="tweet"]')) {
      return previousElement.getAttribute('data-testid') === 'tweet' ? 
        previousElement : previousElement.querySelector('[data-testid="tweet"]');
    }
    previousElement = previousElement.previousElementSibling;
  }
  
  return null;
}

// Helper function to find the container of a link that should be hidden
function findLinkContainer(link) {
  // Try to find a suitable container to hide
  let current = link;
  const containersToCheck = ['cellInnerDiv', 'conversationParts', 'conversationThread'];
  
  while (current && current !== document.body) {
    const testId = current.getAttribute('data-testid');
    if (testId && containersToCheck.includes(testId)) {
      return current;
    }
    
    current = current.parentElement;
  }
  
  return null;
}

// Pre-scan document for tweets to filter
function preScanForTweetsToFilter() {
  // Look for tweets older than the threshold
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  const cutoffTime = new Date(Date.now() - settings.maxAge * 60000);
  
  tweets.forEach(tweet => {
    const timestamp = tweet.querySelector('time');
    if (timestamp) {
      try {
        const tweetTime = parseTweetTime(timestamp);
        if (tweetTime <= cutoffTime) {
          // This is an old tweet - track its ID and conversation ID
          const tweetId = getTweetId(tweet);
          const conversationId = getTweetConversationId(tweet);
          
          if (tweetId) {
            filteredParentIds.add(tweetId);
            allFilteredTweets.add(tweetId);
          }
          
          if (conversationId) {
            filteredParentIds.add(conversationId);
          }
        }
      } catch (error) {
        console.error('Error processing tweet time during pre-scan:', error);
      }
    }
  });
} 