# 🦎 Gecko Mayhem!

A chaotic browser extension game where a messy gecko drops stuff all over your screen!

## 🎮 What is this?

**Gecko Mayhem!** is a fun, chaotic browser game that runs right on top of any webpage. A mischievous gecko scurries across your screen, leaving a trail of falling items in its wake. Your job? Catch them and throw them back before your browser gets completely overwhelmed!

## ✨ Features

- **Realistic Physics**: Items fall, bounce, and collide with realistic physics simulation
- **Interactive Gameplay**: Drag and throw items back at the gecko
- **Auto-play Mode**: Once enabled, the game runs on every page until you disable it
- **Persistent State**: Your enable/disable preference is saved across browser sessions
- **Badge Indicator**: Green "ON" badge shows when the game is active
- **Non-intrusive**: Doesn't interfere with webpage functionality

## 🚀 How to Play

1. **Enable the Game**: Click the extension icon to start
2. **Watch the Chaos**: A gecko will appear and start dropping items
3. **Clean Up**: Drag items with your mouse and throw them back at the gecko
4. **Throw Fast**: Build up speed before releasing to score a successful throw
5. **Disable Anytime**: Click the icon again to stop the madness

## 🎯 Tips & Tricks

- **Throw, Don't Drop**: Moving your mouse quickly before releasing creates a throw
- **Aim for the Gecko**: Only thrown or dragged items can be caught by the gecko
- **Speed Matters**: Fast throws are more likely to be successful
- **Watch the Badge**: Green "ON" badge means the game is running

## 📦 Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the extension folder
6. The Gecko Mayhem icon will appear in your toolbar!

## 🔧 Technical Details

- **Version**: 2.0
- **Manifest**: V3
- **Permissions**: `scripting`, `activeTab`, `storage`
- **Files**: 
  - `manifest.json` - Extension configuration
  - `background.js` - State management & auto-injection
  - `content.js` - Game engine & physics
  - `gecko.gif` - The chaotic gecko sprite
  - `shit.gif` - Falling item sprites

## 🎨 Customization

The game settings are hardcoded but optimized for fun:
- Gecko speed: 1-3 px/frame
- Drop rate: 4-8 items per pass
- Item sizes: 4 levels (24-30px)
- Physics: Realistic gravity, bounce, and friction

## 🐛 Known Issues

- Game doesn't run on `chrome://` or `edge://` pages (browser limitation)
- Very high item counts may slow down performance on older devices

## 📄 License

Created for fun and chaos! Feel free to modify and share.

## 🌐 Homepage

Visit [https://hupuna.com](https://hupuna.com) for more info!

---

**Enjoy the mayhem! 🦎💨**
