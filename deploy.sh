#!/bin/bash

# Run npm build
npm run build

# Shut down Elgato Stream Deck
osascript -e 'tell application "Elgato Stream Deck" to quit'

# Wait for a moment to ensure the application has quit
sleep 2

# Copy files (replace /source/folder and /destination/folder with actual paths)
rsync -av --delete "/Users/johnlong/StreamDeckPlugins/streamdeck-beeminder/com.johnlong.beeminder.sdPlugin" "/Users/johnlong/Library/Application Support/com.elgato.StreamDeck/Plugins"

# Launch Elgato Stream Deck again (requires more time, might as well wait)
# open -a "Elgato Stream Deck"
