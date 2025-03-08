# Reply Guy - File Documentation

*Last updated: 2024-07-03 11:45*

This document provides detailed documentation for each file in the Reply Guy Chrome extension, explaining their purpose, functionality, and key components.

## manifest.json

The extension manifest file defines the extension's capabilities and permissions.

**Key components:**
- `manifest_version`: Version 3 (latest Chrome extension manifest version)
- `permissions`: Required permissions for the extension to function
  - `storage`: For saving user preferences
  - `scripting`: For dynamic script execution
- `host_permissions`: Domain permissions for X.com and Twitter.com
- `action`: Defines the extension's popup interface
- `content_scripts`: Defines scripts that run on matching web pages

## content.js

The main content script that runs on X.com pages to filter tweets in the "For You" feed.

**Key components:**
- Default settings configuration for tweet age (2 hours) and follower count filtering (2000 followers)
- Statistics tracking for filtered and displayed tweets
- Chrome storage integration for loading and monitoring settings
- CSS-based invisible filtering to prevent UI flickering
- Parent-reply relationship tracking to maintain conversation context
- Tweet detection and filtering logic:
  - Age-based filtering using timestamp parsing
  - Parent tweet filtering causing all replies to be filtered automatically
  - Follower count detection and filtering
  - "Show more replies" links filtering for filtered conversations
- DOM manipulation with CSS classes to hide filtered content seamlessly
- UI enhancements:
  - Stats counter showing filter activity
  - "Load More" button for controlled loading
- Scroll protection to prevent automatic loading
- MutationObserver setup to monitor dynamically added content

**Main functions:**
- `isForYouFeed()`: Determines if the user is on the "For You" feed
- `initializeFilter()`: Sets up the filtering system
- `injectFilterStyles()`: Adds CSS rules for invisible filtering
- `setupScrollProtection()`: Prevents automatic scrolling
- `setupObserver()`: Monitors for newly loaded tweets
- `processTweetsImmediately()`: Filters tweets as soon as they're added to the DOM
- `filterTweets()`: Applies filtering logic to tweets
- `parseTweetTime()`: Extracts and calculates tweet age
- `parseFollowerCount()`: Extracts follower count from tweet author
- `getTweetId()`: Extracts unique identifier for tweets
- `getTweetConversationId()`: Identifies which conversation a tweet belongs to
- `isTweetReply()`: Determines if a tweet is a reply to another tweet
- `isReplyingToFilteredUser()`: Checks if a tweet is replying to a user with filtered tweets
- `hideShowMoreRepliesLinks()`: Hides "Show more replies" links for filtered conversations
- `preScanForTweetsToFilter()`: Pre-scans the page for tweets that should be filtered
- `addStatsCounter()`: Adds visual feedback about filtered content
- `loadMoreTweets()`: Handles manual loading of additional tweets

## popup.html

The HTML structure for the extension's popup interface.

**Key components:**
- Extension title and logo
- Toggle for enabling/disabling the time filter
- Dropdown to select maximum tweet age
- Toggle for enabling/disabling follower count filtering
- Input for setting minimum follower count (default: 2000)
- Status message area for feedback
- Responsive styling for the popup

## popup.js

Manages the popup interface functionality and user settings.

**Key components:**
- DOM element selection and setup
- Loading saved settings from Chrome storage
- Default follower count threshold of 2000
- Event listeners for settings changes:
  - Filter enable/disable toggle
  - Time threshold selection
  - Follower filter toggle
  - Minimum follower count input
- Validation for numeric inputs
- Visual feedback for settings changes
- Chrome storage integration for saving preferences

**Main functions:**
- Event setup for all interactive elements
- `showSaveStatus()`: Provides visual feedback when settings are saved
- `showSaveError()`: Provides visual feedback when errors occur

## Recent Changes

*2024-07-03 11:45*
- Implemented CSS-based invisible filtering to prevent UI flickering
- Enhanced parent-reply relationship detection to filter entire conversations
- Added filtering for "Show more replies" links of filtered conversations
- Updated default follower count threshold from 100 to 2000
- Added multiple methods for reply detection to improve accuracy
- Added persistent tracking of filtered tweets across page updates
- Added pre-scanning for tweets to filter when initializing