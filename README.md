# YouTube Time Machine - Modular Build System

This project splits the large YouTube Time Machine userscript into manageable, modular components with an automated build system.

## 📁 File Structure

```
├── src/                           # Source modules
│   ├── config.js                  # Configuration settings
│   ├── api-manager.js            # API key management and rotation
│   ├── subscription-manager.js    # Channel subscriptions
│   ├── recommendation-engine.js   # Smart video recommendations
│   ├── shorts-blocker.js         # YouTube Shorts blocking
│   ├── date-modifier.js          # Date manipulation and display
│   ├── search-interceptor.js     # Search query interception
│   └── ui-manager.js             # User interface management
├── dist/                         # Built output
│   └── yttm-consolidated.user.js # Final userscript
├── build-script.js               # Main build script
├── watch-build.js               # File watcher for development
└── package.json                 # Build configuration
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Userscript
```bash
npm run build
```

### 3. Development Mode (Auto-rebuild)
```bash
npm run dev
```

The consolidated userscript will be created at `dist/yttm-consolidated.user.js`.

## 🔧 Build Process

The build script:
1. Reads all module files from `src/`
2. Removes ES6 import/export statements
3. Combines them with the main class
4. Adds the userscript header
5. Outputs a single `.user.js` file

## 📦 Module Overview

### `config.js`
- Central configuration for all settings
- API limits, selectors, feature flags
- Easy to modify behavior across all modules

### `api-manager.js`
- YouTube API key management
- Unlimited key rotation system
- Request handling and caching
- Quota management and error handling

### `subscription-manager.js`
- Channel subscription storage
- Add/remove channel functionality
- Persistent storage using GM_setValue

### `recommendation-engine.js`
- Smart video recommendation algorithm
- 60/40 same channel vs other channels
- Keyword-based series detection
- Episode number parsing

### `shorts-blocker.js`
- Comprehensive YouTube Shorts blocking
- CSS-based hiding system
- Content analysis for detection
- Aggressive selector matching

### `date-modifier.js`
- Relative date manipulation
- YouTube-style date formatting
- Timeline consistency
- Date parsing and conversion

### `search-interceptor.js`
- Search query modification
- Automatic "before:" date injection
- Filter chip management
- Search result cleanup

### `ui-manager.js`
- Complete user interface
- Settings panel with controls
- Statistics display
- Event handling and styling

## 🛠️ Development Workflow

1. **Make Changes**: Edit any file in `src/`
2. **Auto-Build**: Files are watched and automatically rebuilt
3. **Test**: Install the generated userscript in Tampermonkey
4. **Iterate**: Continue making changes as needed

## 📋 Available Scripts

- `npm run build` - Build once
- `npm run watch` - Watch files and rebuild on changes
- `npm run dev` - Build and start watching (recommended for development)

## 🎯 Benefits of Modular Structure

- **Maintainability**: Each component has a single responsibility
- **Debuggability**: Easier to isolate and fix issues
- **Extensibility**: Simple to add new features
- **Collaboration**: Multiple developers can work on different modules
- **Testing**: Individual components can be tested in isolation

## 🔄 Build Output

The final userscript maintains all original functionality while being generated from clean, modular source code. The build process:

- Preserves all Tampermonkey metadata
- Maintains proper initialization order
- Includes all necessary polyfills
- Optimizes for userscript environment

## 📝 Adding New Features

1. Create a new module in `src/` (e.g., `new-feature.js`)
2. Add it to the `modules` array in `build-script.js`
3. Export classes/functions using standard syntax
4. Import and use in the main `YouTubeTimeMachine` class
5. Run `npm run build` to generate updated userscript

## 🚨 Important Notes

- Always test the built userscript before deployment
- The build process removes ES6 imports/exports for userscript compatibility
- Global variables and GM_* functions are available in all modules
- The watch mode provides instant feedback during development

This modular approach makes the YouTube Time Machine much more maintainable while preserving all its powerful functionality!