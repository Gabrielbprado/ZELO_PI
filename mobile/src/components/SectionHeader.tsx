import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export function SectionHeader({ title, cta, onCta }: { title: string; cta?: string; onCta?: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.6 }}>{title}</Text>
      {cta && (
        <Pressable onPress={onCta} hitSlop={8}>
          <Text style={{ color: theme.colors.textSec, fontSize: 13, fontWeight: '600' }}>{cta}</Text>
        </Pressable>
      )}
    </View>
  );
}
