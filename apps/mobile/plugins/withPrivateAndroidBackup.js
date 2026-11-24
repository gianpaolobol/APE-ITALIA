// Prevent OS backup/transfer of private APE drafts, evidence and session storage.
const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const domains = ['root', 'file', 'database', 'sharedpref', 'external',
  'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludes = domains.map(domain => `<exclude domain="${domain}" path="."/>`).join('\n');
const header = '<?xml version="1.0" encoding="utf-8"?>\n';

module.exports = function withPrivateAndroidBackup(config) {
  config = withAndroidManifest(config, cfg => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = '@xml/ape_no_backup';
    app.$['android:dataExtractionRules'] = '@xml/ape_no_transfer';
    return cfg;
  });
  return withDangerousMod(config, ['android', async cfg => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'ape_no_backup.xml'),
      header + '<full-backup-content>\n' + excludes + '\n</full-backup-content>\n');
    await fs.writeFile(path.join(dir, 'ape_no_transfer.xml'),
      header + '<data-extraction-rules>\n<cloud-backup>\n' + excludes +
      '\n</cloud-backup>\n<device-transfer>\n' + excludes +
      '\n</device-transfer>\n</data-extraction-rules>\n');
    return cfg;
  }]);
};
