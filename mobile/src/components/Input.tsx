import { useState } from 'react';
import { TextInput, View, Text, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, containerStyle, ...rest }: Props) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label && <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600' }}>{label}</Text>}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e)  => { setFocused(false); rest.onBlur?.(e); }}
        placeholderTextColor={theme.colors.textTer}
        style={[
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 14,
            color: theme.colors.text,
            fontSize: 15,
            borderWidth: 1.5,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.primaryHi
                : theme.colors.hairline,
          },
          rest.style,
        ]}
      />
      {error && <Text style={{ color: theme.colors.danger, fontSize: 12 }}>{error}</Text>}
    </View>
  );
}
