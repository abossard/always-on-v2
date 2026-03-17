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
};
