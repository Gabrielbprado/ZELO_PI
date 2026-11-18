import { createElement } from 'react';
import { View } from 'react-native';
import type { ProviderLocation } from '../api/realtime';

const INITIAL_LAT = -23.55052;
const INITIAL_LNG = -46.633308;

export function OpenStreetMapView({ location, height }: { location: ProviderLocation | null; height: number }) {
  const lat = location?.lat ?? INITIAL_LAT;
  const lng = location?.lng ?? INITIAL_LNG;
  const delta = location ? 0.025 : 0.12;
  const bounds = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const marker = location ? `&marker=${lat},${lng}` : '';
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik${marker}`;

  return (
    <View style={{ width: '100%', height, borderRadius: 16, overflow: 'hidden' }}>
      {createElement('iframe', {
        title: 'Mapa OpenStreetMap do deslocamento',
        src,
        style: { width: '100%', height: '100%', border: 0 },
        loading: 'lazy',
      })}
    </View>
  );
}
