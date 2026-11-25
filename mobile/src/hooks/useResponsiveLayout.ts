import { useWindowDimensions } from 'react-native';

/** Breakpoints de layout para web/tablet; no celular o app mantém a navegação atual. */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isTablet: width >= 768,
    isDesktop: width >= 1024,
    isWide: width >= 900,
  };
}
