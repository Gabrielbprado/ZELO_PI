const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withDevCleartext(config, props = {}) {
  return withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    if (props.enabled) {
      application.$['android:usesCleartextTraffic'] = 'true';
    } else {
      delete application.$['android:usesCleartextTraffic'];
    }
    return modConfig;
  });
};
