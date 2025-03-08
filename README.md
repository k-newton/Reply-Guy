# Reply Guy

Reply Guy is a Chrome extension designed to filter the X.com (formerly Twitter) "For You" feed based on tweet age and follower count. It helps improve your browsing experience by showing more relevant and quality content.

## Features

- Filter out tweets older than a customizable time threshold (default: 2 hours)
- Optionally filter out tweets from users with fewer followers than a customizable threshold (default: 2000)
- Shows real-time counter of filtered and shown tweets
- Manual "Load More" button to control tweet loading
- Prevents automatic scrolling
- Seamless filtering with no UI flickering
- Respects conversation context - filters related tweets together

## Installation

1. Clone this repository or download the files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension will now be installed and active when browsing X.com

## Usage

- Click the extension icon to open the settings popup
- Toggle filters on/off and adjust thresholds as needed
- Changes take effect immediately without page reloads
- The extension only works on X.com's "For You" feed

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main filtering logic
- `popup.html` - Settings UI
- `popup.js` - Settings functionality
- `docs/` - Documentation files

## Documentation

For more detailed documentation, see the files in the `docs` directory:

- [Project Structure](docs/project-structure.md)
- [File Documentation](docs/file-documentation.md)