import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export function SectionHeader({ title, cta, onCta }: { title: string; cta?: string; onCta?: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      {cta && (
        <Pressable onPress={onCta}>
          <Text style={{ color: theme.colors.accentBlue, fontSize: 13, fontWeight: '500' }}>{cta}</Text>
        </Pressable>
      )}
    </View>
  );
}
