import { View, Text } from 'react-native';

export function Avatar({
  name,
  size = 44,
  hue = 220,
  ring,
}: { name: string; size?: number; hue?: number; ring?: string }) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 50%, 42%)`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: ring ?? 'transparent',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}
