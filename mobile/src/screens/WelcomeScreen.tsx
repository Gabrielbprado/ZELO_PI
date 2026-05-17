import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Zap } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import type { AuthStackParamList } from '../navigation/types';

export default function WelcomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { theme } = useTheme();

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 24, paddingVertical: 48 }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', marginTop: 80 }}>
          <View
            style={{
              width: 88, height: 88, borderRadius: 24,
              backgroundColor: theme.colors.primaryHi,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: theme.colors.primaryHi, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
            }}
          >
            <Zap size={42} color="#fff" fill="#fff" />
          </View>
          <Text style={{ color: theme.colors.text, fontSize: 36, fontWeight: '800', marginTop: 24, letterSpacing: -1 }}>
            ZERO
          </Text>
          <Text style={{ color: theme.colors.textSec, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            Serviços locais{'\n'}com profissionais verificados
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Button onPress={() => nav.navigate('Login')}>Entrar</Button>
          <Button variant="secondary" onPress={() => nav.navigate('Register', { role: 'CLIENT' })}>
            Criar conta de cliente
          </Button>
          <Button variant="ghost" onPress={() => nav.navigate('Register', { role: 'PROVIDER' })}>
            Sou um profissional
          </Button>
          <Text style={{ color: theme.colors.textTer, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
            Ao continuar você concorda com os Termos e a Política de Privacidade.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
