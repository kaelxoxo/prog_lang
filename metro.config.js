const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]\.env\.server\.local$/,
];

module.exports = config;
