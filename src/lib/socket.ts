import { io, Socket } from 'socket.io-client';
import { useSawaariStore } from './store';

let socket: Socket | null = null;

export const initializeSocket = (token: string): Socket => {
  if (socket) {
    if (socket.connected) return socket;
    socket.connect();
    return socket;
  }

  socket = io('http://localhost:3001', {
    auth: { token },
    query: { token },
    autoConnect: true,
    reconnection: true,
  });

  socket.on('connect', () => {
    console.log('⚡ Connected to Socket.IO Server');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected from Socket.IO Server');
  });

  // Global socket listener to sync ride state changes automatically
  socket.on('ride_accepted', (data) => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide && activeRide.id === data.rideId) {
      useSawaariStore.getState().setActiveRide({
        ...activeRide,
        status: 'accepted',
        driver: {
          id: data.driverId || '',
          vehicleNo: data.vehicleNo,
          vehicleModel: data.vehicleModel,
          rating: data.rating,
          user: {
            name: data.driverName,
            phone: data.driverPhone || '',
          },
        },
      });
    }
  });

  socket.on('driver_arrived', () => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide) {
      useSawaariStore.getState().setActiveRide({
        ...activeRide,
        status: 'arrived',
      });
    }
  });

  socket.on('ride_started', () => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide) {
      useSawaariStore.getState().setActiveRide({
        ...activeRide,
        status: 'in_progress',
      });
    }
  });

  socket.on('ride_completed', (data) => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide) {
      useSawaariStore.getState().setActiveRide({
        ...activeRide,
        status: 'completed',
      });
    }
  });

  socket.on('ride_cancelled', (data) => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide) {
      useSawaariStore.getState().setActiveRide(null);
      alert(`Ride cancelled: ${data.message}`);
    }
  });

  socket.on('ride_failed', (data) => {
    const activeRide = useSawaariStore.getState().activeRide;
    if (activeRide) {
      useSawaariStore.getState().setActiveRide(null);
      alert(`Booking Failed: ${data.message}`);
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => {
  return socket;
};
