import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import type { AuthStackParamList } from '../navigation/types';

export default function WelcomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { theme } = useTheme();

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 28, paddingVertical: 32 }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        {/* Brand mark — wordmark, not a generic icon-in-a-square */}
        <View style={{ marginTop: 64 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 72,
                fontWeight: '800',
                letterSpacing: -3.5,
                lineHeight: 76,
              }}
            >
              zelo
            </Text>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.colors.primary,
                marginBottom: 12,
                marginLeft: 4,
              }}
            />
          </View>
          <Text
            style={{
              color: theme.colors.textSec,
              fontSize: 13,
              fontWeight: '500',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              marginTop: 8,
            }}
          >
            Marketplace de serviços locais
          </Text>
        </View>

        {/* Editorial pitch */}
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 34,
              fontWeight: '700',
              letterSpacing: -1.2,
              lineHeight: 40,
            }}
          >
            Cuidamos do que{'\n'}
            <Text style={{ color: theme.colors.primaryText }}>importa</Text> em casa.
          </Text>
          <Text
            style={{
              color: theme.colors.textSec,
              fontSize: 15,
              lineHeight: 22,
              marginTop: 16,
              maxWidth: 320,
            }}
          >
            Encontre profissionais verificados perto de você, peça orçamento em segundos e acompanhe tudo em um lugar só.
          </Text>
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          <Button onPress={() => nav.navigate('Register', { role: 'CLIENT' })}>
            Começar agora
          </Button>
          <Pressable onPress={() => nav.navigate('Login')} hitSlop={10}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 15,
                fontWeight: '600',
                textAlign: 'center',
                paddingVertical: 12,
              }}
            >
              Já tenho conta
            </Text>
          </Pressable>
          <Pressable
            onPress={() => nav.navigate('Register', { role: 'PROVIDER' })}
            hitSlop={8}
            style={{ paddingVertical: 6 }}
          >
            <Text
              style={{
                color: theme.colors.textSec,
                fontSize: 13,
                fontWeight: '500',
                textAlign: 'center',
              }}
            >
              É profissional? <Text style={{ color: theme.colors.primaryText, fontWeight: '700' }}>Cadastre seu serviço</Text>
            </Text>
          </Pressable>
          <Text
            style={{
              color: theme.colors.textTer,
              fontSize: 11,
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 16,
            }}
          >
            Ao continuar você concorda com os Termos{'\n'}e a Política de Privacidade.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
