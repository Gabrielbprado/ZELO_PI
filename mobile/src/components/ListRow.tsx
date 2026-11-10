import { ReactNode } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Base {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  divider?: boolean;
}

interface PressProps extends Base {
  onPress: () => void;
  destructive?: boolean;
  value?: never;
  onToggle?: never;
}

interface ToggleProps extends Base {
  value: boolean;
  onToggle: (v: boolean) => void;
  onPress?: never;
  destructive?: never;
}

interface StaticProps extends Base {
  onPress?: never;
  value?: never;
  onToggle?: never;
  destructive?: never;
  right?: ReactNode;
}

type Props = PressProps | ToggleProps | StaticProps;

const ROW_MIN_HEIGHT = 54;

/**
 * Linha de lista agrupada no padrão iOS: 54pt de altura mínima, título 17,
 * detalhe 13, indicador chevron e divisor com recuo.
 */
export function ListRow(props: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { icon, title, subtitle, divider } = props;

  const accessory = (() => {
    if ('value' in props && 'onToggle' in props && typeof props.onToggle === 'function') {
      return (
        <Switch
          value={props.value}
          onValueChange={props.onToggle}
          trackColor={{ false: c.surface2, true: c.primaryHi }}
          thumbColor={c.onPrimary}
        />
      );
    }
    if ('right' in props && props.right) return <>{props.right}</>;
    if ('onPress' in props && props.onPress && !('destructive' in props && props.destructive)) {
      return <ChevronRight size={18} color={c.textTer} />;
    }
    return null;
  })();

  const destructive = 'destructive' in props && props.destructive;
  const onPress = 'onPress' in props ? props.onPress : undefined;

  const body = (
    <>
      {icon && (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{
          color: destructive ? c.danger : c.text,
          fontSize: 17,
          textAlign: destructive ? 'center' : 'left',
        }}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ color: c.textSec, fontSize: 13, marginTop: 1 }} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {accessory}
    </>
  );

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 10,
  };

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={title}
          style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? c.surface2 : 'transparent', opacity: pressed ? 0.85 : 1 }]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={rowStyle}>{body}</View>
      )}
      {divider && <View style={{ height: 1, backgroundColor: c.hairline, marginLeft: icon ? 56 : 14 }} />}
    </View>
  );
}
