// Dynamic layer over app.json: build numbers and plugins for CI releases.
const BUILD = String(process.env.BUILD_NUMBER || '1');

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    buildNumber: BUILD,
    // Only standard encryption (HTTPS / OS crypto APIs): exempt from export documentation.
    infoPlist: { ...(config.ios && config.ios.infoPlist), ITSAppUsesNonExemptEncryption: false },
  },
  android: { ...config.android, versionCode: Number(BUILD) },
  plugins: [...(config.plugins || []), './plugins/withAndroidReleaseSigning'],
});
