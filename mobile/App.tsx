import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';

function ThemedShell() {
  const { theme, mode } = useTheme();
  return (
    <NavigationContainer
      theme={{
        dark: mode === 'dark',
        colors: {
          primary: theme.colors.primaryHi,
          background: theme.colors.bg,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.hairline,
          notification: theme.colors.danger,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium:  { fontFamily: 'System', fontWeight: '500' },
          bold:    { fontFamily: 'System', fontWeight: '700' },
          heavy:   { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
