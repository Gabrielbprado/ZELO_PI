import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as providerSelf from '../api/providerSelf';
import * as providersApi from '../api/providers';
import type { Category } from '../types';

export default function ProviderManageScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<providerSelf.ProviderMe | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bio, setBio] = useState('');
  const [priceFromStr, setPriceFromStr] = useState('');
  const [yearsExpStr, setYearsExpStr] = useState('');
  const [available, setAvailable] = useState(true);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [me, cats] = await Promise.all([providerSelf.getMyProvider(), providersApi.getCategories()]);
    setProfile(me);
    setCategories(cats);
    setBio(me.bio ?? '');
    setPriceFromStr(String(me.priceFrom ?? 0));
    setYearsExpStr(String(me.yearsExp ?? 0));
    setAvailable(me.available);
    setSelectedCats(me.categories.map((c) => c.categoryId));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const priceFrom = Math.max(0, parseInt(priceFromStr || '0', 10));
      const yearsExp  = Math.max(0, parseInt(yearsExpStr || '0', 10));
      const updated = await providerSelf.updateMyProvider({
        bio: bio.trim(),
        priceFrom,
        yearsExp,
        available,
        categoryIds: selectedCats,
      });
      setProfile(updated);
      Alert.alert('Salvo', 'Perfil profissional atualizado.');
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao salvar') : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const addService = () => {
    Alert.prompt?.(
      'Novo serviço',
      'Título do serviço (ex.: Vazamento de torneira)',
      async (title) => {
        if (!title || title.trim().length < 2) return;
        Alert.prompt?.('Preço mínimo (R$)', 'Valor de partida', async (priceText) => {
          const priceMin = Math.max(0, parseInt(priceText || '0', 10) || 0);
          if (!profile) return;
          try {
            await providerSelf.createMyService({
              title: title.trim(),
              categoryId: profile.categories[0]?.categoryId ?? categories[0]?.id ?? '',
              priceMin,
            });
            await load();
          } catch (e) {
            Alert.alert('Erro', e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha') : 'Erro');
          }
        }, 'plain-text', '120');
      },
      'plain-text',
    );
    // Em Android Alert.prompt não existe — fallback simples: abre modal próprio (não implementado)
    if (Platform.OS === 'android') {
      Alert.alert('Indisponível no Android', 'A criação rápida de serviço requer iOS por enquanto.');
    }
  };

  const removeService = async (id: string) => {
    Alert.alert('Remover serviço', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try { await providerSelf.deleteMyService(id); await load(); }
          catch { Alert.alert('Erro', 'Não foi possível remover.'); }
        },
      },
    ]);
  };

  const toggleCat = (id: string) => {
    setSelectedCats((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.accentBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Gestão profissional</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}>
          {/* Disponibilidade */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Disponível para serviços</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Desative se estiver de folga.</Text>
            </View>
            <Switch value={available} onValueChange={setAvailable} trackColor={{ false: theme.colors.surface2, true: theme.colors.primaryHi }} thumbColor="#fff" />
          </View>

          {/* Bio */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600' }}>Bio</Text>
            <TextInput
              multiline
              numberOfLines={4}
              value={bio}
              onChangeText={setBio}
              placeholder="Conte um pouco sobre você, sua experiência..."
              placeholderTextColor={theme.colors.textTer}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                borderColor: theme.colors.hairline,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 14,
                minHeight: 110,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input
              label="Preço a partir de (R$)"
              value={priceFromStr}
              onChangeText={(t) => setPriceFromStr(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
            <Input
              label="Anos de experiência"
              value={yearsExpStr}
              onChangeText={(t) => setYearsExpStr(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
          </View>

          {/* Categorias */}
          <View>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Categorias de atuação</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => {
                const active = selectedCats.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleCat(c.id)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                      borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button loading={saving} onPress={saveProfile}>Salvar perfil</Button>

          {/* Serviços */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>Tabela de preços</Text>
              <Pressable onPress={addService} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surface2 }}>
                <Plus size={14} color={theme.colors.text} />
                <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>Adicionar</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, overflow: 'hidden' }}>
              {profile.services.length === 0 ? (
                <Text style={{ padding: 16, color: theme.colors.textTer, fontSize: 12 }}>Nenhum serviço cadastrado ainda.</Text>
              ) : profile.services.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderBottomWidth: i < profile.services.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.hairline,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{s.title}</Text>
                    <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>
                      R$ {s.priceMin}{s.priceMax && s.priceMax !== s.priceMin ? ` – ${s.priceMax}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeService(s.id)} hitSlop={8} style={{ padding: 6 }}>
                    <Trash2 size={16} color={theme.colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
