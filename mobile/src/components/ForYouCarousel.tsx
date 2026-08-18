import { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAsync } from '../hooks/useAsync';
import { getForYou, trackRecEvents } from '../api/recommendations';
import { ProCard } from './ProCard';
import { SectionHeader } from './SectionHeader';
import type { ForYouResponse, RecEventInput, RecommendedProvider } from '../types';

const LIMIT = 8;
const IMPRESSION_FLUSH_MS = 1500;
const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 400 };

interface Props {
  onOpenProvider: (providerId: string) => void;
  onSeeAll?: () => void;
  /** Permite ao Home forçar recarga junto do pull-to-refresh. */
  refreshKey?: number;
}

/**
 * Carrossel "Para você".
 *
 * Trata os QUATRO estados (carregando, erro, vazio, sucesso). Vale registrar o
 * porquê: a maior parte das telas deste app hoje faz `try/finally` sem `catch`,
 * então uma falha de rede aparece como lista vazia — o usuário conclui que não
 * há nada, quando na verdade a requisição quebrou. Aqui o erro é visível e tem
 * botão de tentar de novo.
 */
export function ForYouCarousel({ onOpenProvider, onSeeAll, refreshKey = 0 }: Props) {
  const { theme } = useTheme();
  const reco = useAsync<ForYouResponse>(() => getForYou({ limit: LIMIT }), [refreshKey]);

  const vistos = useRef<Set<string>>(new Set());
  const pendentes = useRef<RecEventInput[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = reco.data?.requestId ?? null;

  // Um requestId novo é uma lista nova: zera o dedup para não perder impressões.
  useEffect(() => {
    vistos.current = new Set();
    pendentes.current = [];
  }, [requestId]);

  const flush = useCallback(() => {
    if (!requestId || pendentes.current.length === 0) return;
    const lote = pendentes.current.splice(0, pendentes.current.length);
    trackRecEvents(requestId, lote);
  }, [requestId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    flush();
  }, [flush]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: RecommendedProvider; index: number | null }> }) => {
      const dados = reco.data;
      if (!dados) return;
      for (const v of viewableItems) {
        if (vistos.current.has(v.item.id)) continue;
        vistos.current.add(v.item.id);
        pendentes.current.push({
          providerId: v.item.id,
          type: 'IMPRESSION',
          position: v.index ?? 0,
          score: v.item.score,
          modelVersion: dados.modelVersion,
          strategy: dados.strategy,
        });
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, IMPRESSION_FLUSH_MS);
    },
  ).current;

  const abrir = (item: RecommendedProvider, index: number) => {
    const dados = reco.data;
    if (dados) {
      // Clique vai imediatamente e sem await: nada pode atrasar a navegação.
      trackRecEvents(dados.requestId, [
        {
          providerId: item.id,
          type: 'CLICK',
          position: index,
          score: item.score,
          modelVersion: dados.modelVersion,
          strategy: dados.strategy,
        },
      ]);
    }
    onOpenProvider(item.id);
  };

  const itens = reco.data?.items ?? [];
  // Quando a lista veio do fallback, ela NÃO é personalizada. Exibir "Bem
  // avaliado" como se fosse uma justificativa individual alegaria uma
  // personalização que não aconteceu.
  const personalizado = reco.data?.strategy !== 'fallback';

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="Para você"
        cta={itens.length > 0 ? 'Ver mais' : undefined}
        onCta={onSeeAll}
      />

      {reco.loading && <Placeholders />}

      {reco.status === 'error' && (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.textSec, fontSize: 13, flex: 1 }}>
            Não foi possível carregar suas recomendações.
          </Text>
          <Pressable
            onPress={() => void reco.refetch()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar recomendações novamente"
          >
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700' }}>
              Tentar de novo
            </Text>
          </Pressable>
        </View>
      )}

      {reco.status === 'success' && itens.length === 0 && (
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 18 }}>
          <Text style={{ color: theme.colors.textSec, fontSize: 13, lineHeight: 19 }}>
            Assim que você contratar seu primeiro serviço, as recomendações
            aparecem aqui.
          </Text>
        </View>
      )}

      {itens.length > 0 && (
        <FlatList
          horizontal
          data={itens}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 4 }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          renderItem={({ item, index }) => (
            <ProCard
              pro={item}
              compact
              reason={personalizado ? item.reasons[0]?.label : undefined}
              onPress={() => abrir(item, index)}
            />
          )}
        />
      )}
    </View>
  );
}

function Placeholders() {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 260,
            height: 96,
            borderRadius: 16,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {i === 0 && <ActivityIndicator color={theme.colors.textTer} />}
        </View>
      ))}
    </View>
  );
}
