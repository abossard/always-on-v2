const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface UserResponse {
  userId: string;
  displayName: string;
  subscription: { tier: string; trialEndsAt: string | null; autoRenew: boolean; isActive: boolean; isTrialing: boolean };
  completions: { level: number; solvedByHuman: boolean; solvedByAutomation: boolean; completedAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface OfferResponse {
  offerId: string;
  title: string;
  description: string;
  acceptText: string;
  declineText: string;
}

export interface CancelStepResponse {
  step: string;
  title: string;
  description: string;
  options: string[];
  hiddenAction: string | null;
}

export interface TrialStatusResponse {
  tier: string;
  trialEndsAt: string | null;
  isActive: boolean;
  wasSilentlyConverted: boolean;
  message: string;
}

// Level 4 types
export interface TrickWordingChallenge {
  challengeId: string;
  options: { id: string; label: string; actualEffect: string; clearLabel: string }[];
}
export interface TrickWordingResult {
  results: { id: string; confusingLabel: string; actualEffect: string; clearLabel: string; wasSelected: boolean; shouldHaveBeenSelected: boolean }[];
  correctCount: number;
  totalOptions: number;
}

// Level 5 types
export interface SettingsResponse {
  newsletterOptIn: boolean;
  shareDataWithPartners: boolean;
  locationTracking: boolean;
  pushNotifications: boolean;
  changedFromDefaults: number;
}

// Level 6 types
export interface CartResponse {
  items: { id: string; name: string; price: number; userAdded: boolean }[];
  total: number;
  sneakedCount: number;
}

// Level 7 types
export interface NagPageResponse {
  content: string;
  showNag: boolean;
  nagTitle: string | null;
  nagMessage: string | null;
  dismissCount: number;
}
export interface NagDismissResponse {
  dismissed: boolean;
  permanent: boolean;
  totalDismissals: number;
}

// Level 8 types
export interface InterfaceTrap {
  actions: { id: string; label: string; isDecoy: boolean; visualWeight: string }[];
}
export interface InterfaceActionResult {
  actionId: string;
  label: string;
  wasDecoy: boolean;
  choseCorrectly: boolean;
}

// Level 9 types
export interface PermissionRequestType {
  permissionId: string;
  displayLabel: string;
  actualScope: string;
  bundledWith: string[];
}
export interface PermissionRevealResponse {
  permissions: { permissionId: string; displayLabel: string; actualScope: string; bundledWith: string[]; wasGranted: boolean }[];
  excessivePermissions: number;
}

// Level 10 types
export interface UrgencyOffer {
  offerId: string;
  productName: string;
  originalPrice: number;
  offerPrice: number;
  fakeItemsLeft: number;
  countdownEnd: string;
  generatedAt: string;
}
export interface UrgencyVerifyResponse {
  timerIsGenuine: boolean;
  stockIsGenuine: boolean;
  explanation: string;
}

export const api = {
  createUser: (displayName?: string) =>
    request<UserResponse>('/users', { method: 'POST', body: JSON.stringify({ displayName }) }),

  getUser: (userId: string) =>
    request<UserResponse>(`/users/${userId}`),

  // Level 1
  getOffer: (userId: string) =>
    request<OfferResponse>(`/levels/1/offer/${userId}`),
  respondToOffer: (userId: string, accepted: boolean) =>
    request<UserResponse>(`/levels/1/respond/${userId}`, { method: 'POST', body: JSON.stringify({ accepted }) }),

  // Level 2
  subscribe: (userId: string) =>
    request<UserResponse>(`/users/${userId}/subscribe`, { method: 'POST' }),
  getCancelStep: (userId: string) =>
    request<CancelStepResponse>(`/users/${userId}/cancel/step`),
  submitCancelStep: (userId: string, selectedOption: string) =>
    request<CancelStepResponse>(`/users/${userId}/cancel/step`, { method: 'POST', body: JSON.stringify({ selectedOption }) }),
  confirmCancel: (userId: string) =>
    request<UserResponse>(`/users/${userId}/cancel/confirm`, { method: 'POST' }),

  // Level 3
  startTrial: (userId: string, durationDays = 7) =>
    request<UserResponse>(`/users/${userId}/trial/start`, { method: 'POST', body: JSON.stringify({ durationDays }) }),
  getTrialStatus: (userId: string) =>
    request<TrialStatusResponse>(`/users/${userId}/trial/status`),
  cancelTrial: (userId: string) =>
    request<UserResponse>(`/users/${userId}/trial/cancel`, { method: 'POST' }),

  // Level 4: Trick Wording
  getChallenge: (userId: string) =>
    request<TrickWordingChallenge>(`/levels/4/challenge/${userId}`),
  submitChallenge: (userId: string, selectedOptionIds: string[]) =>
    request<TrickWordingResult>(`/levels/4/submit/${userId}`, { method: 'POST', body: JSON.stringify({ selectedOptionIds }) }),

  // Level 5: Preselection
  getSettings: (userId: string) =>
    request<SettingsResponse>(`/levels/5/settings/${userId}`),
  updateSettings: (userId: string, settings: Partial<SettingsResponse>) =>
    request<SettingsResponse>(`/levels/5/settings/${userId}`, { method: 'POST', body: JSON.stringify(settings) }),

  // Level 6: Basket Sneaking
  getCart: (userId: string) =>
    request<CartResponse>(`/levels/6/cart/${userId}`),
  addToCart: (userId: string, item: { itemId: string; name: string; price: number }) =>
    request<CartResponse>(`/levels/6/cart/${userId}/add`, { method: 'POST', body: JSON.stringify(item) }),
  checkout: (userId: string) =>
    request<CartResponse>(`/levels/6/cart/${userId}/checkout`, { method: 'POST' }),
  removeFromCart: (userId: string, itemId: string) =>
    request<CartResponse>(`/levels/6/cart/${userId}/remove/${itemId}`, { method: 'POST' }),

  // Level 7: Nagging
  getNagPage: (userId: string) =>
    request<NagPageResponse>(`/levels/7/page/${userId}`),
  dismissNag: (userId: string) =>
    request<NagDismissResponse>(`/levels/7/dismiss/${userId}`, { method: 'POST' }),
  dismissNagPermanently: (userId: string) =>
    request<NagDismissResponse>(`/levels/7/dismiss-permanently/${userId}`, { method: 'POST' }),

  // Level 8: Interface Interference
  getInterfacePage: (userId: string) =>
    request<InterfaceTrap>(`/levels/8/page/${userId}`),
  submitInterfaceAction: (userId: string, actionId: string) =>
    request<InterfaceActionResult>(`/levels/8/action/${userId}`, { method: 'POST', body: JSON.stringify({ actionId }) }),

  // Level 9: Zuckering
  getPermissions: (userId: string) =>
    request<PermissionRequestType[]>(`/levels/9/permissions/${userId}`),
  grantPermissions: (userId: string, grantedPermissionIds: string[]) =>
    request<PermissionRevealResponse>(`/levels/9/permissions/${userId}`, { method: 'POST', body: JSON.stringify({ grantedPermissionIds }) }),

  // Level 10: Emotional Manipulation
  getUrgencyOffer: (userId: string) =>
    request<UrgencyOffer>(`/levels/10/offer/${userId}`),
  verifyUrgency: (userId: string) =>
    request<UrgencyVerifyResponse>(`/levels/10/offer/${userId}/verify`),
  purchaseUrgency: (userId: string, purchased: boolean) =>
    request<UserResponse>(`/levels/10/offer/${userId}/purchase`, { method: 'POST', body: JSON.stringify({ purchased }) }),
};
