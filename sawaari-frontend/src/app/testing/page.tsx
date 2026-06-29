'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import dynamic from 'next/dynamic';
const GoogleMapComponent = dynamic(() => import('../../components/map/GoogleMapComponent'), { ssr: false });
import { 
  Play, Compass, RefreshCw, MapPin, 
  User, CheckCircle, Navigation, ShieldAlert,
  Power, ShieldCheck, Activity, ArrowRight, Star
} from 'lucide-react';

const defaultCenter = { lat: 12.9716, lng: 77.5946 };

export default function TestingDashboard() {
  // Authentication states
  const [passengerToken, setPassengerToken] = useState<string>('');
  const [driverToken, setDriverToken] = useState<string>('');
  const [passengerUser, setPassengerUser] = useState<any>(null);
  const [driverUser, setDriverUser] = useState<any>(null);

  // Position states
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Address labels
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');

  // Diagnostic coordinate updates wrapper functions
  const updatePickupCoords = (coords: { lat: number; lng: number } | null, eventSource: string) => {
    console.log(`[MAP STATE UPDATE] Event: ${eventSource} | Pickup Coordinates | Previous:`, pickupCoords, `| New:`, coords);
    setPickupCoords(coords);
  };

  const updateDropoffCoords = (coords: { lat: number; lng: number } | null, eventSource: string) => {
    console.log(`[MAP STATE UPDATE] Event: ${eventSource} | Dropoff Coordinates | Previous:`, dropoffCoords, `| New:`, coords);
    setDropoffCoords(coords);
  };

  const updateDriverCoords = (coords: { lat: number; lng: number } | null, eventSource: string) => {
    console.log(`[MAP STATE UPDATE] Event: ${eventSource} | Driver Coordinates | Previous:`, driverCoords, `| New:`, coords);
    setDriverCoords(coords);
  };

  // Sockets
  const [passengerSocket, setPassengerSocket] = useState<any>(null);
  const [driverSocket, setDriverSocket] = useState<any>(null);
  const [passengerSocketStatus, setPassengerSocketStatus] = useState('disconnected');
  const [driverSocketStatus, setDriverSocketStatus] = useState('disconnected');

  // Ride lifecycle state
  const [activeRide, setActiveRide] = useState<any>(null);
  const [matchingStatus, setMatchingStatus] = useState('idle'); // idle | searching | matched
  const [driverOnline, setDriverOnline] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [otpCode, setOtpCode] = useState('');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info' | 'loading' | null;
    message: string;
  }>({ type: null, message: '' });

  // Geocoding test variables
  const [testAddress, setTestAddress] = useState('Indiranagar, Bengaluru');
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Sockets Refs to keep latest state without recreating socket
  const driverOnlineRef = useRef(driverOnline);
  const driverCoordsRef = useRef(driverCoords);

  useEffect(() => {
    driverOnlineRef.current = driverOnline;
  }, [driverOnline]);

  useEffect(() => {
    driverCoordsRef.current = driverCoords;
  }, [driverCoords]);

  // Logs function
  const addLog = (msg: string) => {
    setLogMessages((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Helper API callers
  const getHeaders = (token: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });

  const postApi = async (url: string, body: any, token: string) => {
    const res = await fetch(`http://localhost:3001/api${url}`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API request failed');
    }
    return res.json().catch(() => ({}));
  };

  const putApi = async (url: string, body: any, token: string) => {
    const res = await fetch(`http://localhost:3001/api${url}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API request failed');
    }
    return res.json().catch(() => ({}));
  };

  const getApi = async (url: string, token: string) => {
    const res = await fetch(`http://localhost:3001/api${url}`, {
      method: 'GET',
      headers: getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API request failed');
    }
    return res.json().catch(() => ({}));
  };

  // Initialize accounts
  const handleInitialize = async () => {
    setIsInitializing(true);
    setStatus({ type: 'loading', message: 'Initializing E2E test accounts...' });
    addLog('Initializing test accounts...');
    try {
      // 1. Authenticate Passenger
      const passengerPassToken = 'mock-token-passenger-9999911111';
      const passRes = await postApi('/auth/register-or-login', {
        role: 'passenger',
        name: 'Test Passenger E2E',
      }, passengerPassToken);
      setPassengerToken(passRes.token);
      setPassengerUser(passRes.user);
      addLog('Passenger token retrieved.');

      // Clean up any stuck active ride from previous test sessions to ensure a clean slate
      try {
        const activeRes = await fetch('http://localhost:3001/api/rides/active', {
          headers: {
            'Authorization': `Bearer ${passRes.token}`
          }
        });
        if (activeRes.ok) {
          const activeRideData = await activeRes.json().catch(() => null);
          if (activeRideData && activeRideData.id) {
            addLog(`Found stuck active ride ${activeRideData.id} from a previous session. Cancelling...`);
            await postApi(`/rides/${activeRideData.id}/cancel`, { reason: 'Clean E2E session start' }, passRes.token);
            addLog('Previous stuck ride cancelled successfully.');
          }
        }
      } catch (e) {
        addLog('Active ride check skipped or failed.');
      }

      // 2. Authenticate Driver (phone contains 99999999 for auto-approval bypass)
      const driverPassToken = 'mock-token-driver-9999922222';
      const drivRes = await postApi('/auth/register-or-login', {
        role: 'driver',
        name: 'Test Driver E2E',
      }, driverPassToken);
      setDriverToken(drivRes.token);
      setDriverUser(drivRes.user);
      addLog('Driver token retrieved.');

      // 3. Complete driver vehicle registration and documents behind-the-scenes
      try {
        await postApi('/drivers/register', {
          vehicleNo: 'KA-03-E2E-7890',
          vehicleModel: 'Bajaj RE Electric',
          aadhaarNo: '123456789012',
        }, drivRes.token);
        
        await postApi('/drivers/documents', {
          type: 'license',
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }, drivRes.token);
        await postApi('/drivers/documents', {
          type: 'permit',
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }, drivRes.token);
        await postApi('/drivers/documents', {
          type: 'registration',
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }, drivRes.token);
        await postApi('/drivers/documents', {
          type: 'aadhaar',
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }, drivRes.token);
        await postApi('/drivers/documents', {
          type: 'vehicle_photo',
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }, drivRes.token);
        addLog('Driver vehicle profile & auto-approved documents verified.');
      } catch (err: any) {
        if (!err.message?.includes('already registered')) {
          throw err;
        }
        addLog('Driver vehicle profile already active.');
      }

      updatePickupCoords({ lat: 12.9716, lng: 77.5946 }, 'handleInitialize');
      updateDropoffCoords({ lat: 12.9279, lng: 77.6271 }, 'handleInitialize');
      updateDriverCoords({ lat: 12.9750, lng: 77.6000 }, 'handleInitialize');
      setPickupAddress('MG Road Metro Station, Bengaluru');
      setDropoffAddress('Koramangala 3rd Block, Bengaluru');

      addLog('Test accounts initialized successfully.');
      setStatus({ type: 'success', message: 'E2E Accounts initialized successfully!' });
    } catch (e: any) {
      addLog(`Initialization error: ${e.message}`);
      setStatus({ type: 'error', message: `Initialization failed: ${e.message}` });
    } finally {
      setIsInitializing(false);
    }
  };

  // Connect sockets
  useEffect(() => {
    if (!passengerToken) return;

    const pSock = io('http://localhost:3001', {
      auth: { token: passengerToken },
      query: { token: passengerToken },
    });

    pSock.on('connect', () => {
      setPassengerSocketStatus('connected');
      addLog('Passenger socket connected.');
      setStatus({ type: 'success', message: 'Passenger socket connected successfully.' });
    });

    pSock.on('disconnect', () => {
      setPassengerSocketStatus('disconnected');
      addLog('Passenger socket disconnected.');
    });

    pSock.on('connect_error', (err: any) => {
      addLog(`Passenger Socket connect_error: ${err.message}`);
      setStatus({ type: 'error', message: `Passenger WebSocket connection error: ${err.message}` });
    });

    pSock.on('driver_location_changed', (data: any) => {
      updateDriverCoords({ lat: data.latitude, lng: data.longitude }, 'socket_driver_location_changed');
      addLog(`Passenger Socket: Received driver location update: [${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}]`);
    });

    pSock.on('ride_accepted', (data: any) => {
      setActiveRide((prev: any) => ({
        ...prev,
        status: 'accepted',
        driver: {
          user: { name: data.driverName },
          vehicleNo: data.vehicleNo,
          vehicleModel: data.vehicleModel,
        },
      }));
      setMatchingStatus('matched');
      addLog('Passenger Socket: Ride accepted by driver.');
      setStatus({ type: 'success', message: 'Driver accepted the ride! Driver is on the way.' });
    });

    pSock.on('driver_arrived', () => {
      setActiveRide((prev: any) => ({ ...prev, status: 'arrived' }));
      addLog('Passenger Socket: Driver has arrived.');
      setStatus({ type: 'info', message: 'Driver has arrived! Provide OTP pin to the driver.' });
    });

    pSock.on('ride_started', () => {
      setActiveRide((prev: any) => ({ ...prev, status: 'in_progress' }));
      addLog('Passenger Socket: Ride started.');
      setStatus({ type: 'success', message: 'Trip started successfully.' });
    });

    pSock.on('ride_completed', () => {
      setActiveRide((prev: any) => ({ ...prev, status: 'completed' }));
      addLog('Passenger Socket: Ride completed.');
      setStatus({ type: 'success', message: 'Ride completed successfully!' });
    });

    pSock.on('ride_cancelled', (data: any) => {
      setActiveRide(null);
      setMatchingStatus('idle');
      addLog(`Passenger Socket: Ride cancelled: ${data.message}`);
      setStatus({ type: 'error', message: `Ride cancelled: ${data.message}` });
    });

    setPassengerSocket(pSock);

    return () => {
      pSock.disconnect();
    };
  }, [passengerToken]);

  useEffect(() => {
    if (!driverToken) return;

    const dSock = io('http://localhost:3001', {
      auth: { token: driverToken },
      query: { token: driverToken },
    });

    dSock.on('connect', () => {
      setDriverSocketStatus('connected');
      addLog('Driver socket connected.');
      setStatus({ type: 'success', message: 'Driver socket connected successfully.' });

      if (driverOnlineRef.current && driverCoordsRef.current) {
        console.log(`[SOCKET EMIT] Event: driver_location_update (reconnect) | Coordinates:`, driverCoordsRef.current);
        dSock.emit('driver_location_update', {
          latitude: driverCoordsRef.current.lat,
          longitude: driverCoordsRef.current.lng,
          bearing: 0,
        });
        addLog(`Auto-broadcasted driver location on reconnect: [${driverCoordsRef.current.lat.toFixed(5)}, ${driverCoordsRef.current.lng.toFixed(5)}]`);
      }
    });

    dSock.on('disconnect', () => {
      setDriverSocketStatus('disconnected');
      addLog('Driver socket disconnected.');
    });

    dSock.on('connect_error', (err: any) => {
      addLog(`Driver Socket connect_error: ${err.message}`);
      setStatus({ type: 'error', message: `Driver WebSocket connection error: ${err.message}` });
    });

    dSock.on('ride_offer', (data: any) => {
      setIncomingOffer(data);
      addLog('Driver Socket: Received ride request offer dispatch.');
      setStatus({ type: 'info', message: 'New ride offer received!' });
    });

    setDriverSocket(dSock);

    return () => {
      dSock.disconnect();
    };
  }, [driverToken]);

  // Driver Online status toggle
  const toggleDriverOnlineStatus = async () => {
    if (!driverToken) return;
    const nextState = !driverOnline;
    setStatus({ type: 'loading', message: `Setting driver status to ${nextState ? 'ONLINE' : 'OFFLINE'}...` });
    try {
      await putApi('/drivers/status', { isOnline: nextState }, driverToken);
      setDriverOnline(nextState);
      addLog(`Driver went ${nextState ? 'ONLINE' : 'OFFLINE'}.`);
      setStatus({ type: 'success', message: `Driver status is now ${nextState ? 'ONLINE' : 'OFFLINE'}.` });
      if (nextState && driverSocket && driverCoords) {
        driverSocket.emit('driver_location_update', {
          latitude: driverCoords.lat,
          longitude: driverCoords.lng,
          bearing: 0,
        });
      }
    } catch (e: any) {
      addLog(`Driver status error: ${e.message}`);
      setStatus({ type: 'error', message: `Driver status toggle failed: ${e.message}` });
    }
  };

  // Broadcast driver coords when changed
  const broadcastDriverCoords = (coords: { lat: number; lng: number } | null, eventSource: string = 'unknown') => {
    updateDriverCoords(coords, eventSource);
    if (driverOnline && driverSocket && coords) {
      console.log(`[SOCKET EMIT] Event: driver_location_update | Trigger: ${eventSource} | Coordinates:`, coords);
      driverSocket.emit('driver_location_update', {
        latitude: coords.lat,
        longitude: coords.lng,
        bearing: 0,
      });
      addLog(`Broadcasted driver coords: [${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]`);
    }
  };

  // Passenger requests a ride
  const handleRequestRide = async () => {
    if (!passengerToken || !pickupCoords || !dropoffCoords) return;
    setMatchingStatus('searching');
    setStatus({ type: 'loading', message: 'Creating ride request...' });
    addLog('Requesting ride...');
    try {
      const res = await postApi('/rides/request', {
        pickupLatitude: pickupCoords.lat,
        pickupLongitude: pickupCoords.lng,
        pickupAddress,
        dropoffLatitude: dropoffCoords.lat,
        dropoffLongitude: dropoffCoords.lng,
        dropoffAddress,
      }, passengerToken);
      setActiveRide(res);
      addLog(`Ride requested. Ride ID: ${res.id}. OTP: ${res.otp}`);
      setStatus({ type: 'success', message: `Ride requested! ID: ${res.id.slice(0, 8)}, OTP: ${res.otp}` });
    } catch (e: any) {
      setMatchingStatus('idle');
      addLog(`Request ride error: ${e.message}`);
      setStatus({ type: 'error', message: `Ride request failed: ${e.message}` });
    }
  };

  // Accept offer
  const handleAcceptOffer = async () => {
    if (!incomingOffer || !driverToken) return;
    setStatus({ type: 'loading', message: 'Accepting ride offer...' });
    addLog('Accepting ride offer...');
    try {
      const res = await postApi(`/rides/${incomingOffer.rideId}/accept`, {}, driverToken);
      setActiveRide(res);
      setIncomingOffer(null);
      setMatchingStatus('matched');
      addLog('Ride accepted successfully.');
      setStatus({ type: 'success', message: 'Ride accepted successfully by driver!' });
    } catch (e: any) {
      addLog(`Accept ride error: ${e.message}`);
      setStatus({ type: 'error', message: `Accepting offer failed: ${e.message}` });
      setIncomingOffer(null);
    }
  };

  // Driver Arrives
  const handleDriverArrive = async () => {
    if (!activeRide || !driverToken) return;
    setStatus({ type: 'loading', message: 'Marking driver as arrived...' });
    try {
      const res = await postApi(`/rides/${activeRide.id}/arrive`, {}, driverToken);
      setActiveRide(res);
      addLog('Driver marked as arrived.');
      setStatus({ type: 'success', message: 'Driver marked as arrived at pickup location.' });
      if (pickupCoords) {
        broadcastDriverCoords(pickupCoords, 'handleDriverArrive');
      }
    } catch (e: any) {
      addLog(`Arrive error: ${e.message}`);
      setStatus({ type: 'error', message: `Arrive failed: ${e.message}` });
    }
  };

  // Start Ride
  const handleStartRide = async () => {
    if (!activeRide || !driverToken || !otpCode) return;
    setStatus({ type: 'loading', message: 'Verifying OTP & starting trip...' });
    try {
      const res = await postApi(`/rides/${activeRide.id}/start`, { otp: otpCode }, driverToken);
      setActiveRide(res);
      addLog('Ride started.');
      setStatus({ type: 'success', message: 'OTP verified! Trip started successfully.' });
      if (pickupCoords) {
        broadcastDriverCoords(pickupCoords, 'handleStartRide');
      }
    } catch (e: any) {
      addLog(`Start ride error: ${e.message}`);
      setStatus({ type: 'error', message: `Start ride failed: ${e.message}` });
    }
  };

  // Complete Ride
  const handleCompleteRide = async () => {
    if (!activeRide || !driverToken) return;
    setStatus({ type: 'loading', message: 'Completing trip...' });
    try {
      const res = await postApi(`/rides/${activeRide.id}/complete`, {}, driverToken);
      setActiveRide(res);
      setMatchingStatus('idle');
      addLog('Ride completed.');
      setStatus({ type: 'success', message: 'Trip completed successfully! Fare collected.' });
      if (dropoffCoords) {
        broadcastDriverCoords(dropoffCoords, 'handleCompleteRide');
        updatePickupCoords(dropoffCoords, 'handleCompleteRide');
      }
    } catch (e: any) {
      addLog(`Complete ride error: ${e.message}`);
      setStatus({ type: 'error', message: `Complete ride failed: ${e.message}` });
    }
  };

  // Simulate nearby driver (teleports driver nearby + goes online)
  const handleSimulateNearbyDriver = async () => {
    if (!driverToken || !pickupCoords) return;
    // Set coordinate near passenger pickup (0.003 offset)
    const newCoords = {
      lat: pickupCoords.lat + 0.003,
      lng: pickupCoords.lng + 0.003,
    };
    updateDriverCoords(newCoords, 'handleSimulateNearbyDriver');
    addLog('Simulating nearby driver: Teleported close to passenger.');
    setStatus({ type: 'info', message: 'Driver simulated close to passenger.' });
    
    if (!driverOnline) {
      await toggleDriverOnlineStatus();
    } else {
      broadcastDriverCoords(newCoords, 'handleSimulateNearbyDriver');
    }
  };

  // Move driver (and passenger if in_progress) in real-time
  const handleMoveDriver = () => {
    if (!activeRide || !driverCoords) return;
    const stepSize = 0.0005;

    if (activeRide.status === 'in_progress') {
      if (!dropoffCoords) return;
      addLog('Moving driver and passenger toward dropoff...');
      
      const latDiff = dropoffCoords.lat - driverCoords.lat;
      const lngDiff = dropoffCoords.lng - driverCoords.lng;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (distance <= stepSize) {
        broadcastDriverCoords(dropoffCoords, 'move_driver_to_dropoff_completed');
        updatePickupCoords(dropoffCoords, 'move_driver_to_dropoff_completed');
        addLog('Driver and passenger arrived at dropoff destination.');
        setStatus({ type: 'success', message: 'Driver and passenger arrived at destination.' });
      } else {
        const ratio = stepSize / distance;
        const nextCoords = {
          lat: driverCoords.lat + latDiff * ratio,
          lng: driverCoords.lng + lngDiff * ratio,
        };
        broadcastDriverCoords(nextCoords, 'move_driver_to_dropoff_step');
        updatePickupCoords(nextCoords, 'move_driver_to_dropoff_step');
        setStatus({ type: 'info', message: 'Moving towards destination...' });
      }
    } else {
      // Driver moving toward pickup (accepted or arrived or requested)
      if (!pickupCoords) return;
      addLog('Moving driver toward pickup...');
      
      const latDiff = pickupCoords.lat - driverCoords.lat;
      const lngDiff = pickupCoords.lng - driverCoords.lng;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (distance <= stepSize) {
        broadcastDriverCoords(pickupCoords, 'move_driver_to_pickup_completed');
        addLog('Driver arrived at passenger pickup.');
        setStatus({ type: 'success', message: 'Driver arrived at pickup location.' });
      } else {
        const ratio = stepSize / distance;
        const nextCoords = {
          lat: driverCoords.lat + latDiff * ratio,
          lng: driverCoords.lng + lngDiff * ratio,
        };
        broadcastDriverCoords(nextCoords, 'move_driver_to_pickup_step');
        setStatus({ type: 'info', message: 'Driver is moving towards pickup...' });
      }
    }
  };

  // Reset Session
  const handleResetSession = async () => {
    setStatus({ type: 'loading', message: 'Resetting test session...' });
    if (activeRide && passengerToken) {
      try {
        await postApi(`/rides/${activeRide.id}/cancel`, { reason: 'Resetting test session' }, passengerToken);
      } catch (e) {}
    }
    setActiveRide(null);
    setIncomingOffer(null);
    setMatchingStatus('idle');
    setPassengerToken('');
    setDriverToken('');
    setPassengerUser(null);
    setDriverUser(null);
    updatePickupCoords(null, 'handleResetSession');
    updateDropoffCoords(null, 'handleResetSession');
    updateDriverCoords(null, 'handleResetSession');
    setPickupAddress('');
    setDropoffAddress('');
    setDriverOnline(false);
    setLogMessages([]);
    setResolvedCoords(null);
    addLog('Test session reset.');
    setStatus({ type: 'success', message: 'Test session has been reset.' });
  };

  // Test geocoding manually on the panel
  const handleTestGeocode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testAddress.trim() || !passengerToken) return;
    setIsGeocoding(true);
    setStatus({ type: 'loading', message: 'Verifying Google Geocoder...' });
    try {
      const res = await postApi('/users/locations', {
        name: 'Geocoding Test',
        type: 'recent',
        address: testAddress,
        latitude: 12.9716, // generic fallback coordinates to trigger API lookup on backend
        longitude: 77.5946,
      }, passengerToken);
      
      const coords = {
        lat: res.location.coordinates[1],
        lng: res.location.coordinates[0],
      };
      setResolvedCoords(coords);
      addLog(`Geocoding resolved: [${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]`);
      setStatus({ type: 'success', message: `Geocoded: [${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]` });
    } catch (err: any) {
      addLog(`Geocoding error: ${err.message}`);
      setStatus({ type: 'error', message: `Geocoding failed: ${err.message}` });
    } finally {
      setIsGeocoding(false);
    }
  };

  // Assemble map markers
  const mapMarkers: any[] = [];
  if (pickupCoords) {
    mapMarkers.push({
      id: 'pickup',
      position: pickupCoords,
      iconType: 'passenger',
      title: 'Passenger Pickup',
    });
  }
  if (dropoffCoords) {
    mapMarkers.push({
      id: 'dropoff',
      position: dropoffCoords,
      iconType: 'destination',
      title: 'Ride Destination',
    });
  }
  if (driverOnline && driverCoords) {
    mapMarkers.push({
      id: 'driver',
      position: driverCoords,
      iconType: 'driver',
      title: 'Driver Auto',
    });
  }

  const isInitialized = !!passengerToken && !!driverToken && !!pickupCoords && !!dropoffCoords && !!driverCoords;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row relative bg-[#050505] text-white">
      
      {/* LEFT COLUMN: Controls & Simulators */}
      <div className="w-full md:w-[480px] bg-[#0A0A0C] border-r border-[#1C1C22] flex flex-col justify-between overflow-y-auto z-10 p-5 space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-border/40">
          <div>
            <h1 className="text-lg font-light tracking-wide text-primary">E2E Flow Simulator</h1>
            <p className="text-[10px] text-muted">Verify SAWAARI workflows in real-time</p>
          </div>
          <button 
            onClick={handleResetSession}
            className="px-2.5 py-1.5 bg-red-950/20 border border-red-800/30 text-red-400 hover:bg-red-950/40 rounded text-xs transition-colors flex items-center space-x-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Session</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {status.type && (
          <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 animate-pulse ${
            status.type === 'success' ? 'bg-green-950/20 border-green-800/30 text-green-400' :
            status.type === 'error' ? 'bg-red-950/20 border-red-800/30 text-red-400' :
            status.type === 'loading' ? 'bg-blue-950/20 border-blue-800/30 text-blue-400' :
            'bg-yellow-950/20 border-yellow-800/30 text-yellow-400'
          }`}>
            {status.type === 'loading' ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : status.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span className="flex-1 min-w-0 break-words">{status.message}</span>
            {status.type !== 'loading' && (
              <button 
                onClick={() => setStatus({ type: null, message: '' })} 
                className="hover:text-white font-bold ml-2 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Setup Stage or Controls */}
        <div className="flex-1 space-y-6">
          {!isInitialized ? (
            <div className="bg-[#0f0f12] border border-[#1e1e24] p-5 rounded-xl space-y-4 text-center">
              <h2 className="text-sm font-semibold">Initialize Simulators</h2>
              <p className="text-xs text-muted">
                Creates fresh E2E Passenger and Driver accounts on the Postgres/Redis network automatically.
              </p>
              <button
                onClick={handleInitialize}
                disabled={isInitializing}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {isInitializing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Setup E2E Accounts</span>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* PASSENGER SECTION */}
              <div className="bg-[#0f0f12] border border-blue-950/20 p-4 rounded-xl space-y-4">
                <h2 className="text-xs font-bold text-primary flex items-center space-x-1.5 uppercase tracking-wider">
                  <User className="w-4 h-4 text-primary" />
                  <span>Passenger Sim</span>
                </h2>

                <div className="space-y-3">
                  {/* Geolocation Fields */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-muted block mb-0.5">Pickup Lat</label>
                      <input 
                        type="number"
                        step="0.0001"
                        className="w-full bg-[#050507] border border-[#1c1c22] p-1.5 rounded text-white"
                        value={pickupCoords?.lat || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updatePickupCoords(pickupCoords ? { ...pickupCoords, lat: val } : { lat: val, lng: 0 }, 'input_pickup_lat');
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-muted block mb-0.5">Pickup Lng</label>
                      <input 
                        type="number"
                        step="0.0001"
                        className="w-full bg-[#050507] border border-[#1c1c22] p-1.5 rounded text-white"
                        value={pickupCoords?.lng || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updatePickupCoords(pickupCoords ? { ...pickupCoords, lng: val } : { lat: 0, lng: val }, 'input_pickup_lng');
                        }}
                      />
                    </div>
                  </div>

                  {matchingStatus === 'idle' && (
                    <button
                      onClick={handleRequestRide}
                      className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Create Ride Request</span>
                    </button>
                  )}

                  {matchingStatus === 'searching' && (
                    <div className="text-center py-2.5 border border-primary/20 bg-primary/5 rounded-lg flex justify-center items-center space-x-2 animate-pulse">
                      <Compass className="w-4 h-4 text-primary animate-spin" />
                      <span className="text-xs text-primary font-medium">Matching dispatch engine active...</span>
                    </div>
                  )}

                  {matchingStatus === 'matched' && activeRide && (
                    <div className="bg-[#050507] border border-border p-3 rounded-lg text-xs space-y-2">
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-muted">RIDE ID</span>
                        <span className="text-white font-bold">{activeRide.id.slice(0, 8)}...</span>
                      </div>
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-muted">OTP PIN</span>
                        <span className="text-accent font-bold text-sm tracking-widest">{activeRide.otp}</span>
                      </div>
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-muted">STATUS</span>
                        <span className="text-green-400 capitalize">{activeRide.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DRIVER SECTION */}
              <div className="bg-[#0f0f12] border border-yellow-950/20 p-4 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-yellow-500 flex items-center space-x-1.5 uppercase tracking-wider">
                    <Navigation className="w-4 h-4 text-yellow-500" />
                    <span>Driver Sim</span>
                  </h2>
                  
                  <button
                    onClick={toggleDriverOnlineStatus}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-colors ${
                      driverOnline 
                        ? 'bg-green-600/10 text-green-400 border border-green-500/20' 
                        : 'bg-[#050507] text-muted border border-border'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{driverOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-muted block mb-0.5">Driver Lat</label>
                      <input 
                        type="number"
                        step="0.0001"
                        className="w-full bg-[#050507] border border-[#1c1c22] p-1.5 rounded text-white"
                        value={driverCoords?.lat || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          broadcastDriverCoords(driverCoords ? { ...driverCoords, lat: val } : { lat: val, lng: 0 }, 'input_driver_lat');
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-muted block mb-0.5">Driver Lng</label>
                      <input 
                        type="number"
                        step="0.0001"
                        className="w-full bg-[#050507] border border-[#1c1c22] p-1.5 rounded text-white"
                        value={driverCoords?.lng || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          broadcastDriverCoords(driverCoords ? { ...driverCoords, lng: val } : { lat: 0, lng: val }, 'input_driver_lng');
                        }}
                      />
                    </div>
                  </div>

                  {/* Simulated Driver Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleSimulateNearbyDriver}
                      className="py-2 bg-[#050507] border border-border hover:bg-neutral-900 rounded text-[10px] text-white font-medium"
                    >
                      Simulate Nearby
                    </button>
                    <button
                      onClick={handleMoveDriver}
                      disabled={!activeRide || ['completed', 'cancelled'].includes(activeRide.status)}
                      className="py-2 bg-[#050507] border border-border hover:bg-neutral-900 rounded text-[10px] text-white font-medium disabled:opacity-50"
                    >
                      {activeRide?.status === 'in_progress' ? 'Move Toward Dropoff' : 'Move Toward Pickup'}
                    </button>
                  </div>

                  {/* Offer dialog simulated overlay */}
                  {incomingOffer && (
                    <div className="bg-yellow-500/5 border border-yellow-500/20 p-3 rounded-lg text-xs space-y-3 animate-pulse">
                      <p className="font-semibold text-yellow-500 text-center">Incoming Ride Request!</p>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setIncomingOffer(null)}
                          className="w-1/2 py-1.5 bg-[#050507] border border-border text-muted rounded text-[10px]"
                        >
                          Reject
                        </button>
                        <button
                          onClick={handleAcceptOffer}
                          className="w-1/2 py-1.5 bg-yellow-500 text-black font-bold rounded text-[10px]"
                        >
                          Accept Offer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active Ride Driver steps */}
                  {matchingStatus === 'matched' && activeRide && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] text-muted">Driver Actions Flow:</p>
                      
                      {activeRide.status === 'accepted' && (
                        <button
                          onClick={handleDriverArrive}
                          className="w-full py-2 bg-white text-black font-semibold rounded text-xs"
                        >
                          Arrived at Pickup
                        </button>
                      )}

                      {activeRide.status === 'arrived' && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Enter Passenger OTP PIN"
                            maxLength={4}
                            className="w-full bg-[#050507] border border-border rounded p-2 text-center text-xs text-white"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                          />
                          <button
                            onClick={handleStartRide}
                            disabled={otpCode.length < 4}
                            className="w-full py-2 bg-primary text-white font-semibold rounded text-xs disabled:opacity-50"
                          >
                            Verify OTP & Start Trip
                          </button>
                        </div>
                      )}

                      {activeRide.status === 'in_progress' && (
                        <button
                          onClick={handleCompleteRide}
                          className="w-full py-2 bg-green-600 text-white font-semibold rounded text-xs"
                        >
                          Complete Trip & Collect Fare
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* GEOCODING VERIFIER */}
              <div className="bg-[#0f0f12] border border-border p-4 rounded-xl space-y-3">
                <h2 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span>Geocoding API Validator</span>
                </h2>
                <form onSubmit={handleTestGeocode} className="space-y-2">
                  <input
                    type="text"
                    placeholder="Enter address e.g. Indiranagar, Bengaluru"
                    className="w-full bg-[#050507] border border-[#1c1c22] rounded p-2 text-xs text-white placeholder-muted focus:outline-none focus:border-accent"
                    value={testAddress}
                    onChange={(e) => setTestAddress(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isGeocoding}
                    className="w-full py-2 bg-accent hover:bg-opacity-80 text-black text-xs font-bold rounded"
                  >
                    {isGeocoding ? 'Querying API...' : 'Verify Google Geocoder'}
                  </button>
                </form>
                {resolvedCoords && (
                  <div className="bg-[#050507] p-2 rounded text-[10px] font-mono text-green-400 space-y-0.5 border border-border/50">
                    <p>Resolved Lat: {resolvedCoords.lat.toFixed(6)}</p>
                    <p>Resolved Lng: {resolvedCoords.lng.toFixed(6)}</p>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Telemetry Console (Always Visible!) */}
        <div className="border-t border-border/40 pt-4 space-y-3">
          <h3 className="text-primary font-bold text-[10px] tracking-widest border-b border-border/40 pb-1 flex items-center space-x-1.5 uppercase">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span>Telemetry Console</span>
          </h3>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-[#0f0f12] p-2 rounded border border-border/40 flex flex-col">
              <span className="text-muted block">Passenger Socket:</span>
              <span className={passengerSocketStatus === 'connected' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {passengerSocketStatus.toUpperCase()}
              </span>
            </div>
            <div className="bg-[#0f0f12] p-2 rounded border border-border/40 flex flex-col">
              <span className="text-muted block">Driver Socket:</span>
              <span className={driverSocketStatus === 'connected' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {driverSocketStatus.toUpperCase()}
              </span>
            </div>
            <div className="bg-[#0f0f12] p-2 rounded border border-border/40 flex flex-col col-span-2">
              <div className="flex justify-between">
                <span className="text-muted">Matching state:</span>
                <span className="text-white font-bold capitalize">{matchingStatus}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted">Ride ID:</span>
                <span className="text-white font-bold">
                  {activeRide ? activeRide.id.slice(0, 8) + '...' : 'NONE'}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted">Ride Status:</span>
                <span className="text-accent font-bold capitalize">
                  {activeRide ? activeRide.status.replace('_', ' ') : 'IDLE'}
                </span>
              </div>
            </div>
          </div>

          {/* Sockets Log terminal */}
          <div className="border border-border/40 bg-[#050507] p-3 rounded-lg space-y-1.5">
            <p className="text-[9px] text-muted tracking-wider uppercase font-sans">Socket Telemetry Logs:</p>
            <div className="h-[120px] overflow-y-auto text-[9px] text-neutral-400 space-y-1 scrollbar-thin">
              {logMessages.length === 0 ? (
                <p className="italic text-neutral-600">Waiting for socket signals...</p>
              ) : (
                logMessages.map((msg, i) => (
                  <p key={i} className="leading-tight border-b border-neutral-900/50 pb-0.5">{msg}</p>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Google Maps view */}
      <div className="flex-1 h-full relative">
        <GoogleMapComponent
          center={pickupCoords || defaultCenter}
          zoom={13}
          markers={mapMarkers}
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          hasActiveRide={!!activeRide}
        />
      </div>

    </div>
  );
}
