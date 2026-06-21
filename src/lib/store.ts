import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  id: string;
  name: string | null;
  phone: string;
  role: 'passenger' | 'driver' | 'admin';
  firebaseUid: string;
  onboarded?: boolean;
}

export interface RideDetails {
  id: string;
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  pickupLocation: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  pickupAddress: string;
  dropoffLocation: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  dropoffAddress: string;
  fare: number;
  distanceMeters: number;
  durationSeconds: number;
  otp: string;
  cancellationReason?: string;
  cancelledBy?: string;
  driver?: {
    id: string;
    vehicleNo: string;
    vehicleModel: string;
    rating: number;
    user: {
      name: string;
      phone: string;
    };
  };
  passenger?: {
    id: string;
    name: string;
    phone: string;
  };
  rating?: number;
  review?: string;
  createdAt: string;
}

interface SawaariState {
  user: UserProfile | null;
  token: string | null;
  activeRide: RideDetails | null;
  nearbyDrivers: { id: string; latitude: number; longitude: number; bearing?: number }[];
  isOnline: boolean;
  driverLiveLocation: { lat: number; lng: number; bearing: number } | null;
  setAuth: (user: UserProfile, token: string) => void;
  updateUser: (fields: Partial<UserProfile>) => void;
  clearAuth: () => void;
  setActiveRide: (ride: RideDetails | null) => void;
  setNearbyDrivers: (drivers: { id: string; latitude: number; longitude: number; bearing?: number }[]) => void;
  setIsOnline: (online: boolean) => void;
  setDriverLiveLocation: (loc: { lat: number; lng: number; bearing: number } | null) => void;
}

export const useSawaariStore = create<SawaariState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      activeRide: null,
      nearbyDrivers: [],
      isOnline: false,
      driverLiveLocation: null,

      setAuth: (user, token) => set({ user, token }),
      updateUser: (fields) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...fields } : null,
        })),
      clearAuth: () => set({ user: null, token: null, activeRide: null, isOnline: false, driverLiveLocation: null }),
      setActiveRide: (activeRide) => set({ activeRide }),
      setNearbyDrivers: (nearbyDrivers) => set({ nearbyDrivers }),
      setIsOnline: (isOnline) => set({ isOnline }),
      setDriverLiveLocation: (driverLiveLocation) => set({ driverLiveLocation }),
    }),
    {
      name: 'sawaari-session-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }), // Persist user profile and auth token only
    }
  )
);
