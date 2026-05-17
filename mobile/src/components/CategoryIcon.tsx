import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

interface Props { iconKey: string; size?: number; color?: string }

export function CategoryIcon({ iconKey, size = 26, color }: Props) {
  const { theme } = useTheme();
  const stroke = color ?? theme.colors.text;
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (iconKey) {
    case 'plumb':
      return (
        <Svg {...props}>
          <Path d="M9 3v6H6a2 2 0 0 0-2 2v3" />
          <Path d="M9 9h6" />
          <Path d="M15 3v18" />
          <Path d="M19 14v3a2 2 0 0 1-2 2h-2" />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg {...props}>
          <Path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </Svg>
      );
    case 'hammer':
      return (
        <Svg {...props}>
          <Path d="M15 12l-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9" />
          <Path d="M17.64 15L22 10.64" />
        </Svg>
      );
    case 'brush':
      return (
        <Svg {...props}>
          <Path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.07" />
          <Path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
        </Svg>
      );
    case 'spray':
      return (
        <Svg {...props}>
          <Path d="M3 3h6v3l-3 1-3-1V3z" />
          <Path d="M5 8v13a1 1 0 0 0 1 1h0a1 1 0 0 0 1-1V8" />
          <Circle cx="14" cy="6" r="1" />
          <Circle cx="18" cy="4" r="1" />
          <Circle cx="20" cy="9" r="1" />
        </Svg>
      );
    case 'sofa':
      return (
        <Svg {...props}>
          <Path d="M3 11a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v6a2 2 0 0 1-2 2v1H5v-1a2 2 0 0 1-2-2v-6z" />
          <Path d="M5 14V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" />
        </Svg>
      );
    case 'hvac':
      return (
        <Svg {...props}>
          <Rect x="3" y="5" width="18" height="9" rx="2" />
          <Path d="M3 10h18" />
          <Path d="M7 17v3M12 17v3M17 17v3" />
        </Svg>
      );
    case 'leaf':
      return (
        <Svg {...props}>
          <Path d="M11 20A7 7 0 0 1 4 13c0-7 9-9 17-9-1 9-3 16-10 16z" />
          <Path d="M4 21c2-7 6-11 13-13" />
        </Svg>
      );
    default:
      return <View style={{ width: size, height: size }} />;
  }
}
