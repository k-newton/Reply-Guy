# Reply Guy - Project Structure

*Last updated: 2024-07-03 11:45*

## Overview

Reply Guy is a Chrome extension designed to filter the X.com (formerly Twitter) "For You" feed based on two main criteria:
1. Tweet age - hiding tweets older than a configurable threshold
2. Follower count - optionally hiding tweets from users with insufficient followers

The extension aims to improve the user experience by showing more relevant and quality content in the "For You" feed.

## Technical Stack

- **Frontend**: HTML, CSS, JavaScript
- **Browser API**: Chrome Extension API
  - Storage API for saving user preferences
  - Content Scripts for manipulating the X.com DOM
  - Popup for user interface

## Core Functionality

### Content Script (`content.js`)
- Monitors the X.com "For You" feed and filters tweets based on user settings
- Implements tweet age detection and filtering with parent-reply relationship handling
- Implements follower count detection and filtering
- Prevents automatic scrolling/loading to ensure controlled experience
- Provides visual feedback about filtered content
- Adds a manual "Load More" button to control tweet loading
- Uses CSS-based invisible filtering to prevent UI flickering
- Tracks conversation context to ensure related tweets are filtered together

### Popup Interface (`popup.html`, `popup.js`)
- Provides toggles for enabling/disabling filtering features
- Offers dropdown selection for time threshold configuration
- Allows setting minimum follower count (default: 2000)
- Saves settings to Chrome storage for persistence

## File Structure

```
/
├── manifest.json       # Chrome extension manifest defining permissions and structure
├── content.js          # Main content script that runs on X.com pages
├── popup.html          # Extension popup interface
├── popup.js            # Popup functionality and settings management
└── docs/               # Project documentation
    ├── project-structure.md  # This file
    └── file-documentation.md # Detailed documentation for each file
```

## Extension Settings

The extension provides the following user-configurable settings:

1. **Time Filter Toggle**: Enable/disable filtering by tweet age
2. **Time Threshold**: Choose from preset time ranges (30min to 24h)
3. **Follower Filter Toggle**: Enable/disable filtering by follower count
4. **Minimum Followers**: Set the minimum acceptable follower count (default: 2000)

All settings are persisted using Chrome's storage API.

## Installation

The extension is installed through Chrome's extension system, either from the Chrome Web Store or in developer mode by loading the unpacked extension.

## Development Notes

- The extension uses MutationObserver to detect dynamically loaded tweets
- Special care is taken to avoid interfering with normal X.com functionality
- The extension specifically targets only the "For You" feed, not other parts of X.com
- CSS-based filtering with !important flags ensures tweets are hidden without flickering
- Parent-reply relationships are respected to maintain conversation context
- "Show more replies" links are also filtered when their parent tweets are filtered
- Multiple redundant methods are used to identify reply relationships for robustness