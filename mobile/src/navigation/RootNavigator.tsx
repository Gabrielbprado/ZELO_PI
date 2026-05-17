import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Home as IconHome, Calendar, MessageSquare, User } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import ProviderListScreen from '../screens/ProviderListScreen';
import ProviderProfileScreen from '../screens/ProviderProfileScreen';
import BookingScreen from '../screens/BookingScreen';
import BookingsScreen from '../screens/BookingsScreen';
import BookingDetailScreen from '../screens/BookingDetailScreen';
import SmartBudgetScreen from '../screens/SmartBudgetScreen';
import EmergencyScreen from '../screens/EmergencyScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProviderDashboardScreen from '../screens/ProviderDashboardScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PaymentScreen from '../screens/PaymentScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ReviewScreen from '../screens/ReviewScreen';
import ProviderManageScreen from '../screens/ProviderManageScreen';

import type { AuthStackParamList, AppStackParamList, RootTabParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack  = createNativeStackNavigator<AppStackParamList>();
const Tabs      = createBottomTabNavigator<RootTabParamList>();

function TabsNavigator() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isProvider = user?.role === 'PROVIDER';
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.hairline,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: theme.colors.accentBlue,
        tabBarInactiveTintColor: theme.colors.textSec,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="HomeTab"
        component={isProvider ? ProviderDashboardScreen : HomeScreen}
        options={{ title: isProvider ? 'Painel' : 'Início', tabBarIcon: ({ color, size }) => <IconHome color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="BookingsTab"
        component={BookingsScreen}
        options={{ title: 'Agenda', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="MessagesTab"
        component={ConversationsScreen}
        options={{ title: 'Mensagens', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.accentBlue} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
      <AppStack.Screen name="Tabs" component={TabsNavigator} />
      <AppStack.Screen name="ProviderList" component={ProviderListScreen} />
      <AppStack.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <AppStack.Screen name="Booking" component={BookingScreen} />
      <AppStack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <AppStack.Screen name="SmartBudget" component={SmartBudgetScreen} />
      <AppStack.Screen name="Emergency" component={EmergencyScreen} options={{ presentation: 'modal' }} />
      <AppStack.Screen name="Chat" component={ChatScreen} />
      <AppStack.Screen name="Notifications" component={NotificationsScreen} />
      <AppStack.Screen name="Settings" component={SettingsScreen} />
      <AppStack.Screen name="Payment" component={PaymentScreen} />
      <AppStack.Screen name="EditProfile" component={EditProfileScreen} />
      <AppStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <AppStack.Screen name="Review" component={ReviewScreen} options={{ presentation: 'modal' }} />
      <AppStack.Screen name="ProviderManage" component={ProviderManageScreen} />
    </AppStack.Navigator>
  );
}
