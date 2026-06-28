'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSawaariStore, RideDetails } from '../../lib/store';
import { api } from '../../lib/api';
import { getSocket, initializeSocket } from '../../lib/socket';
import dynamic from 'next/dynamic';
const GoogleMapComponent = dynamic(() => import('../../components/map/GoogleMapComponent'), { ssr: false });
import { 
  MapPin, Navigation, ShieldAlert, X, Star, CheckCircle, 
  MapPinIcon, IndianRupee, Compass, ChevronRight, Phone 
} from 'lucide-react';

const defaultCenter = { lat: 12.9716, lng: 77.5946 };

export default function PassengerDashboard() {
  const router = useRouter();
  const { user, token, activeRide, setActiveRide } = useSawaariStore();

  const [pickupAddr, setPickupAddr] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffAddr, setDropoffAddr] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Nominatim Autocomplete & Reverse Geocoding states
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
  const [isLoadingPickupSuggestions, setIsLoadingPickupSuggestions] = useState(false);
  const [isLoadingDropoffSuggestions, setIsLoadingDropoffSuggestions] = useState(false);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);
  const [lastSelectedPickup, setLastSelectedPickup] = useState('');
  const [lastSelectedDropoff, setLastSelectedDropoff] = useState('');

  const [estimate, setEstimate] = useState<{ fare: number; distanceMeters: number; durationSeconds: number } | null>(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  // SOS & Rating
  const [sosTriggered, setSosTriggered] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Live driver tracking coords
  const [driverMarker, setDriverMarker] = useState<{ lat: number; lng: number; bearing?: number } | null>(null);

  // Auto-complete input refs
  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);

  // 1. Authenticated check
  useEffect(() => {
    if (!token || !user) {
      router.push('/');
    }
  }, [token, user, router]);

  // 2. Hydrate active ride on mount
  useEffect(() => {
    if (token) {
      api.get<RideDetails | null>('/rides/active')
        .then((ride) => {
          if (ride) {
            setActiveRide(ride);
            setPickupCoords({
              lat: ride.pickupLocation.coordinates[1],
              lng: ride.pickupLocation.coordinates[0],
            });
            setDropoffCoords({
              lat: ride.dropoffLocation.coordinates[1],
              lng: ride.dropoffLocation.coordinates[0],
            });
            setPickupAddr(ride.pickupAddress);
            setDropoffAddr(ride.dropoffAddress);
          }
        })
        .catch((err) => console.error('Failed to load active ride:', err));
    }
  }, [token, setActiveRide]);

  // 3. Setup socket location update listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket && token) {
      initializeSocket(token);
    }

    const currentSocket = getSocket();
    if (currentSocket) {
      currentSocket.on('driver_location_changed', (data: { latitude: number; longitude: number; bearing: number }) => {
        setDriverMarker({
          lat: data.latitude,
          lng: data.longitude,
          bearing: data.bearing,
        });
      });
    }

    return () => {
      if (currentSocket) {
        currentSocket.off('driver_location_changed');
      }
    };
  }, [token, activeRide]);

  // Debounced search for Pickup
  useEffect(() => {
    if (!pickupAddr || pickupAddr === lastSelectedPickup || pickupAddr === 'Current Live Location' || pickupAddr.startsWith('Selected Pickup')) {
      setPickupSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsLoadingPickupSuggestions(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pickupAddr)}&format=json&limit=5&addressdetails=1&countrycodes=in`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Sawaari-App/1.0',
          }
        });
        if (res.ok) {
          const data = await res.json();
          setPickupSuggestions(data);
        }
      } catch (err) {
        console.error('Pickup Nominatim lookup error:', err);
      } finally {
        setIsLoadingPickupSuggestions(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [pickupAddr, lastSelectedPickup]);

  // Debounced search for Dropoff
  useEffect(() => {
    if (!dropoffAddr || dropoffAddr === lastSelectedDropoff || dropoffAddr.startsWith('Selected Destination')) {
      setDropoffSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsLoadingDropoffSuggestions(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dropoffAddr)}&format=json&limit=5&addressdetails=1&countrycodes=in`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Sawaari-App/1.0',
          }
        });
        if (res.ok) {
          const data = await res.json();
          setDropoffSuggestions(data);
        }
      } catch (err) {
        console.error('Dropoff Nominatim lookup error:', err);
      } finally {
        setIsLoadingDropoffSuggestions(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [dropoffAddr, lastSelectedDropoff]);

  const handleSelectPickupSuggestion = (suggestion: any) => {
    const coords = {
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
    };
    setPickupCoords(coords);
    setPickupAddr(suggestion.display_name);
    setLastSelectedPickup(suggestion.display_name);
    setShowPickupSuggestions(false);
  };

  const handleSelectDropoffSuggestion = (suggestion: any) => {
    const coords = {
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
    };
    setDropoffCoords(coords);
    setDropoffAddr(suggestion.display_name);
    setLastSelectedDropoff(suggestion.display_name);
    setShowDropoffSuggestions(false);
  };

  // 5. Detect current GPS location
  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setPickupCoords(coords);
          setPickupAddr('Current Live Location');
          
          // Reverse geocoding lookup using Nominatim
          const reverseGeocode = async () => {
            try {
              const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`;
              const res = await fetch(url, {
                headers: {
                  'User-Agent': 'Sawaari-App/1.0',
                }
              });
              if (res.ok) {
                const data = await res.json();
                if (data.display_name) {
                  setPickupAddr(data.display_name);
                  setLastSelectedPickup(data.display_name);
                }
              }
            } catch (err) {
              console.error('Failed reverse geocoding:', err);
            }
          };
          reverseGeocode();
        },
        (error) => {
          alert('Failed to detect location. Please search manually.');
        }
      );
    }
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (!pickupCoords) {
      setPickupCoords(coords);
      setPickupAddr(`Selected Pickup Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    } else if (!dropoffCoords) {
      setDropoffCoords(coords);
      setDropoffAddr(`Selected Destination Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    }
  };

  // 6. Get Fare Estimate
  const handleGetEstimate = async () => {
    if (!pickupAddr || !dropoffAddr) {
      alert('Please specify pickup and destination addresses');
      return;
    }

    let pCoords = pickupCoords;
    let dCoords = dropoffCoords;

    if (!pCoords) {
      pCoords = { lat: 12.9716, lng: 77.5946 };
      setPickupCoords(pCoords);
    }
    if (!dCoords) {
      dCoords = { lat: 12.9279, lng: 77.6271 };
      setDropoffCoords(dCoords);
    }

    setIsLoadingEstimate(true);
    try {
      const res = await api.post<{ fare: number; distanceMeters: number; durationSeconds: number }>('/rides/estimate', {
        pickup: pCoords,
        dropoff: dCoords,
      });
      setEstimate(res);
    } catch (e: any) {
      alert(e.message || 'Failed to calculate estimate');
    } finally {
      setIsLoadingEstimate(false);
    }
  };

  // 7. Request Ride
  const handleRequestRide = async () => {
    if (!pickupCoords || !dropoffCoords || !pickupAddr || !dropoffAddr) return;

    setIsSubmittingBooking(true);
    try {
      const ride = await api.post<RideDetails>('/rides/request', {
        pickupLatitude: pickupCoords.lat,
        pickupLongitude: pickupCoords.lng,
        pickupAddress: pickupAddr,
        dropoffLatitude: dropoffCoords.lat,
        dropoffLongitude: dropoffCoords.lng,
        dropoffAddress: dropoffAddr,
      });
      setActiveRide(ride);
    } catch (e: any) {
      alert(e.message || 'Failed to request ride');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // 8. Cancel Ride Booking
  const handleCancelRide = async () => {
    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`, {
        reason: cancelReason || 'Passenger cancelled ride',
      });
      setActiveRide(null);
      setEstimate(null);
      setDriverMarker(null);
      setShowCancelModal(false);
      setCancelReason('');
    } catch (e: any) {
      alert(e.message || 'Failed to cancel ride');
    }
  };

  // 9. Submit Rating Review
  const handleSubmitReview = async () => {
    if (!activeRide) return;
    setIsSubmittingReview(true);
    try {
      await api.post(`/rides/${activeRide.id}/rate`, {
        rating,
        review,
      });
      setActiveRide(null);
      setEstimate(null);
      setDriverMarker(null);
      setReview('');
      setRating(5);
    } catch (e: any) {
      alert(e.message || 'Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // 10. Trigger SOS Emergency Action
  const handleTriggerSOS = async () => {
    if (!activeRide || !pickupCoords) return;
    try {
      await api.post('/sos/trigger', {
        rideId: activeRide.id,
        latitude: pickupCoords.lat,
        longitude: pickupCoords.lng,
      });
      setSosTriggered(true);
      setTimeout(() => setSosTriggered(false), 5000); // Reset alert text
    } catch (e: any) {
      alert('Failed to send SOS. Please dial 112 directly!');
    }
  };

  // Dynamic state derivation
  const hasRide = !!activeRide;
  const isRequested = activeRide?.status === 'requested';
  const isAccepted = activeRide?.status === 'accepted';
  const isArrived = activeRide?.status === 'arrived';
  const isInProgress = activeRide?.status === 'in_progress';
  const isCompleted = activeRide?.status === 'completed';

  const mapCenter = driverMarker || pickupCoords || defaultCenter;

  const mapMarkers = [];
  if (pickupCoords) {
    mapMarkers.push({
      id: 'pickup',
      position: pickupCoords,
      iconType: 'passenger' as const,
      title: 'Pickup Location',
    });
  }
  if (dropoffCoords) {
    mapMarkers.push({
      id: 'dropoff',
      position: dropoffCoords,
      iconType: 'destination' as const,
      title: 'Destination Location',
    });
  }
  if (driverMarker) {
    mapMarkers.push({
      id: 'driver',
      position: driverMarker,
      iconType: 'driver' as const,
      title: 'Your Auto Rickshaw',
    });
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row relative bg-background overflow-hidden">
      
      {/* LEFT COLUMN: Controls & Details Panel */}
      <div className="w-full md:w-[400px] lg:w-[420px] shrink-0 bg-background border-r border-border flex flex-col justify-between overflow-y-auto z-10">
        
        {/* Active Ride States Panel */}
        {hasRide ? (
          <div className="p-6 md:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-start">
            
            {/* REQUESTED: Matching status */}
            {isRequested && (
              <div className="space-y-6 md:space-y-8 flex flex-col justify-start">
                {/* Card 1: Searching Status */}
                <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto relative">
                    <Compass className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: '4s' }} />
                    <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-white">Finding Nearest Autos</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      Our sequential matching dispatch is evaluating nearby auto drivers based on distance and availability.
                    </p>
                  </div>
                </div>

                {/* Card 2: Estimated Fare Details Card */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest">Ride Details</h4>
                  <div className="flex justify-between items-center text-xs pb-3 border-b border-border/30">
                    <span className="text-muted">Estimated Fare</span>
                    <span className="text-sm font-bold text-white flex items-center">
                      <IndianRupee className="w-3.5 h-3.5 mr-0.5 text-primary" />
                      {activeRide.fare}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Distance</span>
                    <span className="text-white font-semibold">{(activeRide.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                </div>

                {/* Cancel Request CTA */}
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full py-4 bg-card hover:bg-neutral-900 border border-border text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 active:scale-[0.98] outline-none"
                >
                  Cancel Request
                </button>
              </div>
            )}

            {/* ACCEPTED / ARRIVED: Driver Info */}
            {(isAccepted || isArrived) && (
              <div className="space-y-6 md:space-y-8 flex flex-col justify-start">
                
                {/* Card 1: Status & Ride Badge Card */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-3 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Ride Status</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                      isArrived 
                        ? 'bg-accent/10 border-accent/30 text-accent' 
                        : 'bg-primary/10 border-primary/30 text-primary'
                    }`}>
                      {isArrived ? 'Auto Arrived' : 'Auto Heading to You'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Driver Assigned</h3>
                </div>

                {/* Card 2: Driver Details Profile Card */}
                {activeRide.driver && (
                  <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                    <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest">Your Captain</h4>
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center font-bold text-lg text-primary uppercase shrink-0">
                        {activeRide.driver.user.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-bold text-white truncate mr-2">{activeRide.driver.user.name}</span>
                          <span className="text-xs text-accent font-bold flex items-center shrink-0">
                            <Star className="w-3.5 h-3.5 fill-accent stroke-accent mr-1" />
                            {activeRide.driver.rating}
                          </span>
                        </div>
                        <p className="text-xs text-white uppercase font-mono tracking-widest mt-1">{activeRide.driver.vehicleNo}</p>
                        <p className="text-[10px] text-muted truncate mt-0.5">{activeRide.driver.vehicleModel}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card 3: Ride OTP Box Card */}
                <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3.5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Share OTP to Start Journey</p>
                  <div className="bg-background border border-border/80 rounded-xl py-3.5 px-7 inline-block">
                    <p className="text-4xl font-semibold tracking-[0.25em] text-white font-mono leading-none">{activeRide.otp}</p>
                  </div>
                </div>

                {/* Emergency SOS & Cancel Controls */}
                <div className="space-y-3">
                  <button
                    onClick={handleTriggerSOS}
                    className="w-full py-4 bg-red-600/10 hover:bg-red-600 border border-red-500/20 hover:border-red-600 text-red-500 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 transition-all duration-200 active:scale-[0.98] outline-none"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{sosTriggered ? 'SOS Dispatched!' : 'Trigger SOS Emergency'}</span>
                  </button>

                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-4 bg-card hover:bg-neutral-900 border border-border text-muted hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 active:scale-[0.98] outline-none"
                  >
                    Cancel Ride
                  </button>
                </div>
              </div>
            )}

            {/* IN_PROGRESS: Ride Started */}
            {isInProgress && (
              <div className="space-y-6 md:space-y-8 flex flex-col justify-start">
                
                {/* Card 1: Status & Trip Card */}
                <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Navigation className="w-8 h-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-white tracking-tight">Ride In Progress</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      You are currently travelling towards your destination. Keep track of the live route movement on the map.
                    </p>
                  </div>
                </div>

                {/* Card 2: Destination Details Card */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-2.5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Destination Address</p>
                  <p className="text-xs text-white font-medium leading-relaxed">{activeRide.dropoffAddress}</p>
                </div>

                {/* SOS Emergency Controls */}
                <button
                  onClick={handleTriggerSOS}
                  className="w-full py-4 bg-red-600/10 hover:bg-red-600 border border-red-500/20 hover:border-red-600 text-red-500 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 transition-all duration-200 active:scale-[0.98] outline-none"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{sosTriggered ? 'SOS Alert Active!' : 'Trigger SOS Emergency'}</span>
                </button>
              </div>
            )}

            {/* COMPLETED: Receipt and Ratings review */}
            {isCompleted && (
              <div className="space-y-6 md:space-y-8 flex flex-col justify-start">
                
                {/* Card 1: Completion Status Card */}
                <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-green-500">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Arrived at Destination</h3>
                  <p className="text-xs text-muted">Thanks for riding with SAWAARI.</p>
                </div>

                {/* Card 2: Invoice Receipt Details Card */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest">Trip Receipt</h4>
                  <div className="flex justify-between items-center pb-3 border-b border-border/30 text-xs">
                    <span className="text-muted">Total Fare (Cash/UPI)</span>
                    <span className="text-lg font-bold text-white flex items-center tracking-tight">
                      <IndianRupee className="w-4 h-4 mr-0.5 text-primary" />
                      {activeRide.fare}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Total Distance</span>
                    <span className="text-white font-medium">{(activeRide.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                </div>

                {/* Card 3: Rating Review Form Card */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest">Rate Driver</h4>
                  
                  <div className="flex justify-center space-x-2.5 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-0.5 transition-transform duration-150 hover:scale-110"
                      >
                        <Star className={`w-8 h-8 transition-colors duration-200 ease-out ${
                          star <= rating 
                            ? 'fill-accent stroke-accent text-accent' 
                            : 'stroke-border text-border fill-transparent hover:stroke-accent/50'
                        }`} />
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Brief Review (Optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Excellent ride, polite driver, clean rickshaw..."
                      className="w-full bg-background border border-border rounded-xl p-3 text-xs text-white placeholder-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-200 ease-out resize-none"
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="w-full py-4 bg-primary hover:bg-[#1D4ED8] text-white text-xs font-bold uppercase tracking-wider rounded-xl flex justify-center items-center space-x-2 transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50 outline-none"
                  >
                    {isSubmittingReview ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Submit Feedback</span>
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        ) : (
          // Booking Inputs view (Default Idle State)
          <div className="p-6 md:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-between">
            <div className="space-y-6 md:space-y-8">
              
              {/* Request a Ride Header */}
              <div className="space-y-2 px-1">
                <h2 className="text-xl font-bold tracking-tight text-white leading-tight">Request a Ride</h2>
                <p className="text-xs text-muted">Set pickup and dropoff points across Bengaluru.</p>
              </div>

              {/* Card 1: Booking Address Input Card */}
              <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40">
                
                {/* Pickup Autocomplete input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Pickup Address</label>
                    <button
                      onClick={handleDetectLocation}
                      className="text-[10px] font-bold text-primary hover:text-primary-dark hover:underline flex items-center space-x-1 transition-all duration-200 ease-out"
                    >
                      <MapPinIcon className="w-3 h-3" />
                      <span>Use current location</span>
                    </button>
                  </div>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted group-focus-within:text-primary transition-colors duration-200 ease-out">
                      <MapPin className="w-4 h-4 text-primary" />
                    </span>
                    <input
                      ref={pickupInputRef}
                      type="text"
                      placeholder="Search pickup address..."
                      className="w-full bg-background border border-border rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold text-white placeholder:text-muted/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-200 ease-out"
                      value={pickupAddr}
                      onChange={(e) => setPickupAddr(e.target.value)}
                      onFocus={() => setShowPickupSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowPickupSuggestions(false), 200)}
                    />
                    
                    {showPickupSuggestions && (pickupSuggestions.length > 0 || isLoadingPickupSuggestions) && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-border/30 backdrop-blur-md">
                        {isLoadingPickupSuggestions ? (
                          <div className="p-4 text-xs text-muted flex items-center space-x-2">
                            <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span>Searching locations...</span>
                          </div>
                        ) : (
                          pickupSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.place_id}
                              type="button"
                              onClick={() => handleSelectPickupSuggestion(suggestion)}
                              className="w-full text-left p-3.5 hover:bg-background transition-colors duration-200 text-xs text-white flex flex-col space-y-0.5 outline-none"
                            >
                              <span className="font-semibold text-white">{suggestion.display_name.split(',')[0]}</span>
                              <span className="text-[10px] text-muted truncate">{suggestion.display_name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Destination Autocomplete input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Destination Address</label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted group-focus-within:text-red-500 transition-colors duration-200 ease-out">
                      <MapPin className="w-4 h-4 text-red-500" />
                    </span>
                    <input
                      ref={dropoffInputRef}
                      type="text"
                      placeholder="Search destination..."
                      className="w-full bg-background border border-border rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold text-white placeholder:text-muted/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-200 ease-out"
                      value={dropoffAddr}
                      onChange={(e) => setDropoffAddr(e.target.value)}
                      onFocus={() => setShowDropoffSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowDropoffSuggestions(false), 200)}
                    />
                    
                    {showDropoffSuggestions && (dropoffSuggestions.length > 0 || isLoadingDropoffSuggestions) && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-border/30 backdrop-blur-md">
                        {isLoadingDropoffSuggestions ? (
                          <div className="p-4 text-xs text-muted flex items-center space-x-2">
                            <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span>Searching locations...</span>
                          </div>
                        ) : (
                          dropoffSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.place_id}
                              type="button"
                              onClick={() => handleSelectDropoffSuggestion(suggestion)}
                              className="w-full text-left p-3.5 hover:bg-background transition-colors duration-200 text-xs text-white flex flex-col space-y-0.5 outline-none"
                            >
                              <span className="font-semibold text-white">{suggestion.display_name.split(',')[0]}</span>
                              <span className="text-[10px] text-muted truncate">{suggestion.display_name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Calculate CTA button */}
                {!estimate && (
                  <button
                    onClick={handleGetEstimate}
                    disabled={isLoadingEstimate || !pickupAddr.trim() || !dropoffAddr.trim()}
                    className="w-full py-4 bg-primary hover:bg-[#1D4ED8] text-white text-xs font-bold uppercase tracking-wider rounded-xl flex justify-center items-center space-x-2 transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none hover:shadow-lg hover:shadow-primary/20 outline-none"
                  >
                    {isLoadingEstimate ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Calculate Route & Price</span>
                    )}
                  </button>
                )}
              </div>

              {/* Card 2: Nearby Autos Widget */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-md hover:shadow-black/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="p-1.5 bg-accent/10 border border-accent/20 rounded-lg text-accent">
                      <Compass className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Nearby Autos</span>
                  </div>
                  <span className="text-[10px] font-bold text-accent flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mr-1.5 animate-pulse" />
                    6 Autos nearby
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-extrabold text-white leading-tight">6 Autos nearby</p>
                  <p className="text-xs text-muted leading-relaxed">Drivers are available around your location.</p>
                </div>
              </div>

              {/* Card 3: Estimate Receipt summary Card */}
              {estimate && (
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#333333] hover:shadow-xl hover:shadow-black/40 animate-fadeIn">
                  <div className="text-center py-2 space-y-1">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest block">Estimated Fare</span>
                    <span className="text-4xl font-extrabold text-white flex items-center justify-center tracking-tight font-sans">
                      <span className="text-2xl font-semibold text-primary mr-1">₹</span>
                      {estimate.fare}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4 text-center">
                    <div className="space-y-0.5 border-r border-border/40">
                      <span className="text-[9px] font-bold text-muted uppercase tracking-wider block">Distance</span>
                      <p className="text-sm font-bold text-white">{(estimate.distanceMeters / 1000).toFixed(1)} km</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-muted uppercase tracking-wider block">Duration</span>
                      <p className="text-sm font-bold text-white">{Math.round(estimate.durationSeconds / 60)} mins</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted border-t border-border/40 pt-4">
                    <span>Accepted Payment Modes</span>
                    <span className="font-semibold text-white">Cash / UPI</span>
                  </div>

                  <button
                    onClick={handleRequestRide}
                    disabled={isSubmittingBooking}
                    className="w-full mt-2 py-4 bg-primary hover:bg-[#1D4ED8] text-white text-xs font-bold uppercase tracking-wider rounded-xl flex justify-center items-center space-x-2 transition-all duration-200 ease-out hover:shadow-md hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 outline-none"
                  >
                    {isSubmittingBooking ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Request SAWAARI Auto</span>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* Quick Helper */}
            <div className="border-t border-border/40 pt-4 mt-auto">
              <span className="text-[10px] text-muted/80 leading-relaxed block italic">
                OpenStreetMap Nominatim suggestions will appear as you type. Routing is powered by OSRM.
              </span>
            </div>
          </div>
        )}

      </div>

      {/* RIGHT COLUMN: Leaflet Map Canvas */}
      <div className="flex-1 h-full bg-background p-4 md:p-6 flex flex-col overflow-hidden">
        <div className="flex-1 rounded-[24px] border border-border bg-card overflow-hidden relative shadow-2xl shadow-black/80">
          <GoogleMapComponent
            center={mapCenter}
            zoom={14}
            markers={mapMarkers}
            pickupCoords={pickupCoords}
            dropoffCoords={dropoffCoords}
            onMapClick={handleMapClick}
            hasActiveRide={!!activeRide || !!estimate}
          />
        </div>
      </div>

      {/* CANCELLATION DIALOG MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn animate-duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white tracking-tight">Cancel Ride Booking?</h3>
            <p className="text-xs text-muted leading-relaxed">Please provide a brief reason for cancelling your booking.</p>
            <textarea
              rows={3}
              placeholder="Driver taking too long, changed my mind..."
              className="w-full bg-background border border-border rounded-xl p-3 text-xs text-white placeholder-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all duration-200 ease-out resize-none"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="w-1/2 py-3 bg-background border border-border text-muted hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 active:scale-[0.98] outline-none"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelRide}
                className="w-1/2 py-3 bg-red-600 hover:bg-red-750 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 active:scale-[0.98] outline-none"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
