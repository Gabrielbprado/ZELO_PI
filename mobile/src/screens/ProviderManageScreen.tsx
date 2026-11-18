import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CalendarClock, ChevronRight, Plus, ShieldCheck, Trash2, Wallet } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { PageHeader } from '../components/PageHeader';
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
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceTitle, setServiceTitle] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceCategoryId, setServiceCategoryId] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingProfile(true);
    setLoadError(null);
    try {
      const [me, cats] = await Promise.all([providerSelf.getMyProvider(), providersApi.getCategories()]);
      setProfile(me);
      setCategories(cats);
      setBio(me.bio ?? '');
      setPriceFromStr(String(me.priceFrom ?? 0));
      setYearsExpStr(String(me.yearsExp ?? 0));
      setAvailable(me.available);
      setSelectedCats(me.categories.map((c) => c.categoryId));
    } catch {
      setLoadError('Não foi possível carregar seu perfil profissional. Confira sua conexão e tente novamente.');
    } finally {
      setLoadingProfile(false);
    }
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
    setServiceTitle('');
    setServicePrice('');
    setServiceCategoryId(profile?.categories[0]?.categoryId ?? categories[0]?.id ?? '');
    setServiceModal(true);
  };

  const saveService = async () => {
    const title = serviceTitle.trim();
    const priceMin = Number.parseInt(servicePrice.replace(/\D/g, ''), 10);
    if (title.length < 2) {
      Alert.alert('Título inválido', 'Informe um título com pelo menos 2 caracteres.');
      return;
    }
    if (!serviceCategoryId) {
      Alert.alert('Categoria necessária', 'Cadastre uma categoria no seu perfil antes de criar o serviço.');
      return;
    }
    if (!Number.isFinite(priceMin) || priceMin < 0) {
      Alert.alert('Preço inválido', 'Informe um preço mínimo válido.');
      return;
    }
    setServiceSaving(true);
    try {
      await providerSelf.createMyService({ title, categoryId: serviceCategoryId, priceMin });
      setServiceModal(false);
      await load();
    } catch (e) {
      Alert.alert('Erro', e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Não foi possível cadastrar o serviço.') : 'Não foi possível cadastrar o serviço.');
    } finally {
      setServiceSaving(false);
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

  if (loadingProfile && !profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>{loadError ?? 'Perfil profissional indisponível.'}</Text>
        <Button variant="secondary" onPress={load}>Tentar novamente</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <PageHeader title="Gestão profissional" onBack={() => nav.goBack()} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}>
          {/* Disponibilidade */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Disponível para serviços</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Desative se estiver de folga.</Text>
            </View>
            <Switch value={available} onValueChange={setAvailable} trackColor={{ false: theme.colors.surface2, true: theme.colors.primaryHi }} thumbColor={theme.colors.onPrimary} />
          </View>

          {/* Agenda */}
          <Pressable
            onPress={() => nav.navigate('Availability' as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, padding: 14 }}
          >
            <CalendarClock size={20} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Minha agenda</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Defina os dias e horários que você atende.</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.textTer} />
          </Pressable>

          {/* Verificação (KYC) */}
          <Pressable
            onPress={() => nav.navigate('Kyc' as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, padding: 14 }}
          >
            <ShieldCheck size={20} color={theme.colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Verificação (KYC)</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Envie documentos e ganhe o selo verificado.</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.textTer} />
          </Pressable>

          {/* Carteira */}
          <Pressable
            onPress={() => nav.navigate('Wallet' as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, padding: 14 }}
          >
            <Wallet size={20} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Carteira</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Saldo, extrato e saque via PIX.</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.textTer} />
          </Pressable>

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
                      backgroundColor: active ? theme.colors.primaryDeep : theme.colors.surface,
                      borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{c.name}</Text>
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

      <Modal visible={serviceModal} transparent animationType="slide" onRequestClose={() => setServiceModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.overlay }}>
          <View style={{ backgroundColor: theme.colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>Novo serviço</Text>
            <Input label="Título do serviço" placeholder="Ex.: Vazamento de torneira" value={serviceTitle} onChangeText={setServiceTitle} />
            <Input label="Preço mínimo (R$)" placeholder="0" value={servicePrice} onChangeText={(value) => setServicePrice(value.replace(/\D/g, ''))} keyboardType="number-pad" />
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600' }}>Categoria</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((category) => {
                const selected = serviceCategoryId === category.id;
                return (
                  <Pressable key={category.id} onPress={() => setServiceCategoryId(category.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: selected ? theme.colors.primaryDeep : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.colors.primaryHi : theme.colors.hairline }}>
                    <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button loading={serviceSaving} onPress={saveService}>Cadastrar serviço</Button>
            <Button variant="secondary" onPress={() => setServiceModal(false)}>Cancelar</Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
