import { useEffect } from 'react';
import { View, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}

/**
 * Placeholder pulsante para carregamento. Preferido ao `ActivityIndicator` centralizado
 * nas listas: preserva o layout, então a tela não "salta" quando os dados chegam.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: Props) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.9, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius ?? theme.radius.sm, backgroundColor: theme.colors.surface2 },
        animated,
        style,
      ]}
    />
  );
}

/** Esqueleto de um item de lista com avatar + duas linhas — o formato mais comum do app. */
export function SkeletonRow() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1, borderColor: theme.colors.hairline,
        paddingHorizontal: 14, paddingVertical: 14,
      }}
    >
      <Skeleton width={44} height={44} radius={22} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="80%" height={11} />
      </View>
    </View>
  );
}

/** Lista de esqueletos, para telas que carregam coleções. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 20, gap: 10 }}>
      {Array.from({ length: count }, (_, i) => <SkeletonRow key={i} />)}
    </View>
  );
}
