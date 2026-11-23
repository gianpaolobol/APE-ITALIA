// Expo config plugin: release builds are signed with the upload key when ANDROID_KEYSTORE_PATH is set
// at build time (CI secrets); otherwise Gradle falls back to the debug key (local/unsigned verification).
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let src = cfg.modResults.contents;
    if (src.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return cfg;
    src = src.replace(/signingConfigs\s*\{/, m => m + RELEASE_CONFIG);
    // Only inside buildTypes { ... release { ... } }: use the upload key when available.
    const bt = src.indexOf('buildTypes');
    const rel = bt === -1 ? -1 : src.indexOf('release', bt);
    const line = rel === -1 ? -1 : src.indexOf('signingConfig signingConfigs.debug', rel);
    if (line === -1) throw new Error('withAndroidReleaseSigning: buildTypes.release not found');
    src = src.slice(0, line) + "signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug" + src.slice(line + 'signingConfig signingConfigs.debug'.length);
    if (!src.includes("signingConfigs.release : signingConfigs.debug")) throw new Error('withAndroidReleaseSigning: release buildType not found');
    cfg.modResults.contents = src;
    return cfg;
  });
};
