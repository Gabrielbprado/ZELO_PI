export type Role = 'CLIENT' | 'PROVIDER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  name: string;
  role: Role;
  avatarHue: number;
  city?: string | null;
  neighborhood?: string | null;
  emailVerified: boolean;
}

export interface Category {
  id: string;
  name: string;
  iconKey: string;
  hue: number;
  order: number;
}

export interface Provider {
  id: string;
  userId: string;
  name: string;
  avatarHue: number;
  city?: string | null;
  neighborhood?: string | null;
  bio?: string | null;
  yearsExp: number;
  jobsDone: number;
  rating: number;
  reviews: number;
  verified: boolean;
  available: boolean;
  priceFrom: number;
  distance?: string;
  categories: Category[];
  services?: ProviderService[];
  portfolio?: PortfolioItem[];
}

export interface ProviderService {
  id: string;
  title: string;
  description?: string | null;
  priceMin: number;
  priceMax?: number | null;
  unit: string;
}

export interface PortfolioItem {
  id: string;
  caption?: string | null;
  hue: number;
}

export type BookingStatus =
  | 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export interface Booking {
  id: string;
  clientId: string;
  providerId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  address: string;
  scheduledAt?: string | null;
  urgency: 'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE';
  status: BookingStatus;
  priceEstimate?: number | null;
  priceFinal?: number | null;
  completedAt?: string | null;
  createdAt: string;
  category?: Category;
  provider?: { id: string; user: { id: string; name: string; avatarHue: number } };
  client?: { id: string; name: string; avatarHue: number };
  reviews?: Array<{ id: string; authorId: string; targetId: string; rating: number; comment?: string | null }>;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  author?: { id: string; name: string; avatarHue: number };
}

export interface Notification {
  id: string;
  type: 'BOOKING' | 'MESSAGE' | 'REVIEW' | 'PROMO' | 'SYSTEM';
  title: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

export interface MessageItem {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  bookingId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface BudgetResult {
  id: string;
  estimateMin: number;
  estimateMax: number;
  currency: string;
  breakdown: { label: string; value: string }[];
}

// ── Recomendação personalizada ──────────────────────────────────────────────

export type RecReasonCode =
  | 'REHIRE'
  | 'SAME_CATEGORY_HISTORY'
  | 'NEARBY'
  | 'TOP_RATED'
  | 'SIMILAR_CLIENTS'
  | 'PRICE_FIT'
  | 'VERIFIED'
  | 'FAST_RESPONSE'
  | 'NEW_TALENT';

export interface RecReason {
  code: RecReasonCode;
  /** Texto já em pt-BR, montado pelo backend. */
  label: string;
  value: number | null;
}

/** Estratégia usada; `fallback` = o ML não respondeu e a lista veio por avaliação. */
export type RecStrategy =
  | 'ranker'
  | 'cold_start_popularity'
  | 'heuristic_fallback'
  | 'fallback';

/** Estende `Provider` em vez de bifurcá-lo: o mesmo card serve os dois casos. */
export interface RecommendedProvider extends Provider {
  score: number | null;
  reasons: RecReason[];
}

export interface ForYouResponse {
  items: RecommendedProvider[];
  strategy: RecStrategy;
  modelVersion: string | null;
  /** Correlaciona a lista exibida com os eventos de telemetria. */
  requestId: string;
}

export interface RecEventInput {
  providerId: string;
  type: 'IMPRESSION' | 'CLICK';
  position: number;
  score?: number | null;
  modelVersion?: string | null;
  strategy?: string | null;
  categoryId?: string | null;
}
