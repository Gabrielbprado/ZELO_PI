import { useState } from 'react';
import { TextInput, View, Text, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const MAX_ERROR_LENGTH = 120;

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

/**
 * Campo de texto no padrão iOS: retângulo arredondado preenchido (estilo
 * "grouped"), 17pt, e anel de foco na cor da marca — não sublinhado.
 * Mensagens de erro longas são truncadas para não quebrar layout.
 */
export function Input({ label, error, containerStyle, ...rest }: Props) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  const displayError = error && error.length > MAX_ERROR_LENGTH
    ? error.slice(0, MAX_ERROR_LENGTH - 1).trimEnd() + '…'
    : error;

  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label && (
        <Text style={{ color: theme.colors.textSec, fontSize: 13, fontWeight: '600' }}>
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
            backgroundColor: theme.colors.surface2,
            borderRadius: theme.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 13,
            color: theme.colors.text,
            fontSize: 17,
            borderWidth: 1,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.primary
                : theme.colors.hairline,
          },
          rest.style,
        ]}
      />
      {displayError && (
        <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{displayError}</Text>
      )}
    </View>
  );
}
