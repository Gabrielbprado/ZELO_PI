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
    <View style={[{ gap: 8 }, containerStyle]}>
      {label && (
        <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {label}
        </Text>
      )}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e)  => { setFocused(false); rest.onBlur?.(e); }}
        placeholderTextColor={theme.colors.textTer}
        style={[
          {
            backgroundColor: 'transparent',
            borderRadius: 0,
            paddingHorizontal: 0,
            paddingVertical: 14,
            color: theme.colors.text,
            fontSize: 17,
            borderWidth: 0,
            borderBottomWidth: 1.5,
            borderBottomColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.text
                : theme.colors.hairline2,
          },
          rest.style,
        ]}
      />
      {error && <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: '500' }}>{error}</Text>}
    </View>
  );
}
