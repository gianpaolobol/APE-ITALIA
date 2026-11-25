// Dynamic layer over app.json: build numbers and plugins for CI releases.
const BUILD = String(process.env.BUILD_NUMBER || '1');

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    buildNumber: BUILD,
    // Local archives now use a third-party AEAD implementation. Do not declare
    // an exemption before the App Store Connect export compliance review.
  },
  android: { ...config.android, versionCode: Number(BUILD) },
  plugins: [...(config.plugins || []), './plugins/withAndroidReleaseSigning'],
});
