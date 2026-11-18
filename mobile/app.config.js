const appJson = require('./app.json');
module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };
  // In Expo Go, always reach the development API through its public Dev Tunnel,
  // never through the Metro host/LAN address. Production builds use their own URL.
  const production = process.env.EAS_BUILD_PROFILE === 'production';
  const apiUrl = production
    ? process.env.EXPO_PUBLIC_API_BASE_URL
    : 'https://64xdts99-4000.brs.devtunnels.ms/api/v1';
  if (production && (!apiUrl || !apiUrl.startsWith('https://'))) {
    throw new Error('Defina EXPO_PUBLIC_API_BASE_URL com uma URL HTTPS antes do build production.');
  }
  const developmentHttp = process.env.EAS_BUILD_PROFILE !== 'production' && (!apiUrl || apiUrl.startsWith('http://'));
  const plugins = [...(base.plugins ?? []), 'expo-status-bar'];
  plugins.push(['./plugins/withDevCleartext', { enabled: developmentHttp }]);

  return {
    ...base,
    plugins,
    android: { ...base.android },
    extra: {
      ...base.extra,
      apiBaseUrl: apiUrl,
    },
  };
};
