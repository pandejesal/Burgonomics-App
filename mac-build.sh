#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "================================================="
echo "   Burgonomics Mac Build Automation Script"
echo "================================================="
echo ""

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/ or via Homebrew (brew install node)"
    exit 1
fi
echo "✅ Node.js is installed ($(node -v))"

# 2. Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm is installed ($(npm -v))"

# 3. Check for CocoaPods
if ! command -v pod &> /dev/null; then
    echo "❌ CocoaPods is not installed. Capacitor requires CocoaPods to install iOS native dependencies."
    echo "Attempting to install CocoaPods using Homebrew..."
    
    if command -v brew &> /dev/null; then
        brew install cocoapods
    else
        echo "❌ Homebrew is not installed. Please run this command in terminal to install CocoaPods:"
        echo "   sudo gem install cocoapods"
        echo "Then re-run this script."
        exit 1
    fi
fi
echo "✅ CocoaPods is installed ($(pod --version))"

echo ""
echo "================================================="
echo "   Installing Dependencies & Building Web App"
echo "================================================="
echo ""

# Install dependencies (using npm ci for a clean install if package-lock exists)
if [ -f "package-lock.json" ]; then
    echo "📦 Running npm ci..."
    npm ci
else
    echo "📦 Running npm install..."
    npm install
fi

# Build the Vite React app
echo "🔨 Building frontend web assets..."
npm run build:mobile

echo ""
echo "================================================="
echo "   Syncing Capacitor iOS Native Project"
echo "================================================="
echo ""

# Run capacitor sync
echo "🔄 Running npx cap sync ios..."
npx cap sync ios

echo ""
echo "================================================="
echo "   Success! Launching Xcode..."
echo "================================================="
echo ""
echo "In Xcode, please do the following:"
echo "1. Click 'App' in the left navigator (with the blue icon)"
echo "2. Go to 'Signing & Capabilities' tab"
echo "3. Select your Apple Developer Team in the dropdown"
echo "4. In the top menu bar, go to Product -> Destination -> Any iOS Device (arm64)"
echo "5. Finally, go to Product -> Archive"
echo ""

# Open Xcode workspace
npx cap open ios
