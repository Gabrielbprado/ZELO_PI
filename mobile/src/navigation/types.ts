import type { Category } from '../types';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: { role?: 'CLIENT' | 'PROVIDER' } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { devToken?: string } | undefined;
};

export type RootTabParamList = {
  HomeTab: undefined;
  BookingsTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  ProviderList: { category?: Category; q?: string };
  ProviderProfile: { providerId: string };
  Booking: { providerId: string; categoryId: string };
  BookingDetail: { bookingId: string };
  Tracking: { bookingId: string; providerName?: string };
  SmartBudget: undefined;
  Emergency: undefined;
  Chat: { otherUserId: string; otherName: string; otherHue?: number };
  Notifications: undefined;
  Settings: undefined;
  Payment: { bookingId: string; amount: number };
  EditProfile: undefined;
  ChangePassword: undefined;
  Review: { bookingId: string; providerName: string };
  ProviderManage: undefined;
  Availability: undefined;
  Kyc: undefined;
  Report: { targetUserId: string; targetName?: string; bookingId?: string };
  Wallet: undefined;
  Payout: { balanceCents: number };
};
