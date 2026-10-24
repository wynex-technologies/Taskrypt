// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Rive state-machine files and Lottie JSON are bundled as assets.
config.resolver.assetExts.push('riv');

module.exports = config;
