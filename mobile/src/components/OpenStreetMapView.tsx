import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebView as WebViewType } from 'react-native-webview';
import type { ProviderLocation } from '../api/realtime';

const INITIAL_LAT = -23.55052;
const INITIAL_LNG = -46.633308;

function updateScript(location: ProviderLocation) {
  return `window.updateProviderLocation(${location.lat}, ${location.lng}); true;`;
}

const MAP_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;width:100%;margin:0} .leaflet-control-attribution{font-size:10px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map', { zoomControl: true }).setView([${INITIAL_LAT}, ${INITIAL_LNG}], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);
let marker = null;
window.updateProviderLocation = (lat, lng) => {
  const point = [lat, lng];
  if (!marker) marker = L.circleMarker(point, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
  else marker.setLatLng(point);
  map.setView(point, 16, { animate: true, duration: 0.5 });
};
</script></body></html>`;

export function OpenStreetMapView({ location, height }: { location: ProviderLocation | null; height: number }) {
  const webView = useRef<WebViewType>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current && location) webView.current?.injectJavaScript(updateScript(location));
  }, [location?.lat, location?.lng]);

  return (
    <WebView
      ref={webView}
      source={{ html: MAP_HTML }}
      style={[styles.map, { height }]}
      originWhitelist={['*']}
      userAgent="ZELO Marketplace/1.0"
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={() => {
        loaded.current = true;
        if (location) webView.current?.injectJavaScript(updateScript(location));
      }}
    />
  );
}

const styles = StyleSheet.create({ map: { width: '100%', borderRadius: 16, overflow: 'hidden' } });
