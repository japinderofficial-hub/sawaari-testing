'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSawaariStore, RideDetails } from '../../lib/store';
import { api } from '../../lib/api';
import { getSocket, initializeSocket } from '../../lib/socket';
import GoogleMapComponent from '../../components/map/GoogleMapComponent';
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

  // 4. Load Google Places Autocomplete dynamically
  useEffect(() => {
    if (!pickupInputRef.current || !dropoffInputRef.current) return;

    const initAutocomplete = () => {
      if (typeof window === 'undefined' || !window.google || !window.google.maps || !window.google.maps.places) return;

      const pickupAutocomplete = new window.google.maps.places.Autocomplete(pickupInputRef.current!, {
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry'],
      });

      pickupAutocomplete.addListener('place_changed', () => {
        const place = pickupAutocomplete.getPlace();
        if (place.geometry?.location) {
          const coords = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          };
          setPickupCoords(coords);
          setPickupAddr(place.formatted_address || '');
        }
      });

      const dropoffAutocomplete = new window.google.maps.places.Autocomplete(dropoffInputRef.current!, {
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry'],
      });

      dropoffAutocomplete.addListener('place_changed', () => {
        const place = dropoffAutocomplete.getPlace();
        if (place.geometry?.location) {
          const coords = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          };
          setDropoffCoords(coords);
          setDropoffAddr(place.formatted_address || '');
        }
      });
    };

    // Retry checking if script loaded every 1 sec
    const timer = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.places) {
        initAutocomplete();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
          
          // Reverse geocoding lookup
          if (window.google && window.google.maps) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: coords }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                setPickupAddr(results[0].formatted_address);
              }
            });
          }
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
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row relative">
      
      {/* LEFT COLUMN: Controls & Details Panel */}
      <div className="w-full md:w-[420px] bg-[#050505] border-r border-border flex flex-col justify-between overflow-y-auto z-10">
        
        {/* Active Ride States Panel */}
        {hasRide ? (
          <div className="p-6 space-y-6 flex-1">
            
            {/* REQUESTED: Matching status */}
            {isRequested && (
              <div className="space-y-6 text-center py-8">
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <Compass className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white">Finding nearest autos...</h3>
                  <p className="text-xs text-muted">Sequential dispatch matching algorithm is evaluating nearby drivers based on distance and idle time.</p>
                </div>
                <div className="border border-border/50 bg-[#0A0A0A] rounded-lg p-4 text-left space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Estimated Fare</span>
                    <span className="text-white font-semibold flex items-center"><IndianRupee className="w-3 h-3 mr-0.5" />{activeRide.fare}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Distance</span>
                    <span className="text-white">{(activeRide.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full py-3 bg-[#0A0A0A] border border-border text-muted hover:text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel Request
                </button>
              </div>
            )}

            {/* ACCEPTED / ARRIVED: Driver Info */}
            {(isAccepted || isArrived) && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${isArrived ? 'bg-accent text-black' : 'bg-primary text-white'}`}>
                    {isArrived ? 'Auto Arrived' : 'Auto Heading to You'}
                  </span>
                  <h3 className="text-xl font-light text-white">Driver assigned</h3>
                </div>

                {/* Driver Profile */}
                {activeRide.driver && (
                  <div className="flex items-center space-x-4 border border-border bg-[#0A0A0A] rounded-xl p-4">
                    <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center font-bold text-primary">
                      {activeRide.driver.user.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-semibold text-white">{activeRide.driver.user.name}</span>
                        <span className="text-xs text-accent flex items-center">
                          <Star className="w-3.5 h-3.5 fill-accent stroke-accent mr-1" />
                          {activeRide.driver.rating}
                        </span>
                      </div>
                      <p className="text-xs text-white mt-1 uppercase font-mono tracking-wider">{activeRide.driver.vehicleNo}</p>
                      <p className="text-[10px] text-muted">{activeRide.driver.vehicleModel}</p>
                    </div>
                  </div>
                )}

                {/* Ride OTP Box */}
                <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 text-center space-y-2">
                  <p className="text-xs text-muted uppercase tracking-wider">Share OTP to start journey</p>
                  <p className="text-4xl font-light tracking-[0.2em] text-white font-mono">{activeRide.otp}</p>
                </div>

                {/* Emergency SOS & Cancel Controls */}
                <div className="space-y-3">
                  <button
                    onClick={handleTriggerSOS}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>{sosTriggered ? 'SOS Dispatched!' : 'Trigger SOS Emergency'}</span>
                  </button>

                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-3 bg-[#0A0A0A] border border-border text-muted hover:text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Cancel Ride
                  </button>
                </div>
              </div>
            )}

            {/* IN_PROGRESS: Ride Started */}
            {isInProgress && (
              <div className="space-y-6 text-center py-6">
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <Navigation className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white">Ride In Progress</h3>
                  <p className="text-xs text-muted">You are currently travelling towards your destination: {activeRide.dropoffAddress}. Keep track of route movements on the map.</p>
                </div>

                <div className="border border-border bg-[#0A0A0A] rounded-xl p-4 text-left space-y-2">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Destination address</p>
                  <p className="text-xs text-white">{activeRide.dropoffAddress}</p>
                </div>

                <button
                  onClick={handleTriggerSOS}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{sosTriggered ? 'SOS Alert Active!' : 'Trigger SOS Emergency'}</span>
                </button>
              </div>
            )}

            {/* COMPLETED: Receipt and Ratings review */}
            {isCompleted && (
              <div className="space-y-6">
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-primary mx-auto mb-3" />
                  <h3 className="text-xl font-light text-white">Arrived at Destination</h3>
                  <p className="text-xs text-muted">Thanks for riding with SAWAARI.</p>
                </div>

                <div className="border border-border bg-[#0A0A0A] rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center text-xs border-b border-border/50 pb-3">
                    <span className="text-muted">Total Fare (Cash/UPI)</span>
                    <span className="text-base font-bold text-white flex items-center"><IndianRupee className="w-3.5 h-3.5 mr-0.5" />{activeRide.fare}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Total Distance</span>
                    <span className="text-white">{(activeRide.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                </div>

                {/* Rating Input Form */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <p className="text-xs font-semibold text-white">Rate your driver</p>
                  <div className="flex justify-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 hover:scale-110 transition-transform"
                      >
                        <Star className={`w-8 h-8 ${star <= rating ? 'fill-accent stroke-accent' : 'stroke-muted text-muted'}`} />
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Share a brief review (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Excellent ride, polite driver, clean rickshaw..."
                      className="w-full bg-[#0A0A0A] border border-border rounded-lg p-3 text-xs text-white placeholder-muted focus:outline-none focus:border-primary transition-colors resize-none"
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isSubmittingReview ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Submit Rating</span>}
                  </button>
                </div>
              </div>
            )}

          </div>
        ) : (
          // Booking Inputs view (Default Idle State)
          <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-light text-white">Request a Ride</h2>
                <p className="text-xs text-muted">Set pickup and dropoff points across Bengaluru.</p>
              </div>

              <div className="space-y-4">
                {/* Pickup Autocomplete input */}
                <div className="space-y-1">
                  <label className="text-xs text-muted flex justify-between">
                    <span>Pickup Address</span>
                    <button
                      onClick={handleDetectLocation}
                      className="text-[10px] text-primary hover:underline flex items-center space-x-0.5"
                    >
                      <MapPinIcon className="w-3 h-3" />
                      <span>Use current location</span>
                    </button>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                      <MapPin className="w-4 h-4 text-primary" />
                    </span>
                    <input
                      ref={pickupInputRef}
                      type="text"
                      placeholder="Search pickup address..."
                      className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                      value={pickupAddr}
                      onChange={(e) => setPickupAddr(e.target.value)}
                    />
                  </div>
                </div>

                {/* Destination Autocomplete input */}
                <div className="space-y-1">
                  <label className="text-xs text-muted">Destination Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                      <MapPin className="w-4 h-4 text-red-500" />
                    </span>
                    <input
                      ref={dropoffInputRef}
                      type="text"
                      placeholder="Search destination..."
                      className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                      value={dropoffAddr}
                      onChange={(e) => setDropoffAddr(e.target.value)}
                    />
                  </div>
                </div>

                {!estimate && (
                  <button
                    onClick={handleGetEstimate}
                    disabled={isLoadingEstimate || !pickupAddr.trim() || !dropoffAddr.trim()}
                    className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoadingEstimate ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Calculate Route & Price</span>}
                  </button>
                )}
              </div>

              {/* Estimate Receipt summary */}
              {estimate && (
                <div className="border border-border bg-[#0A0A0A] rounded-xl p-5 space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Estimated Price</span>
                    <span className="text-base font-bold text-white flex items-center"><IndianRupee className="w-3.5 h-3.5 mr-0.5 text-primary" />{estimate.fare}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Distance</span>
                    <span className="text-white font-medium">{(estimate.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Duration</span>
                    <span className="text-white font-medium">{Math.round(estimate.durationSeconds / 60)} mins</span>
                  </div>

                  <button
                    onClick={handleRequestRide}
                    disabled={isSubmittingBooking}
                    className="w-full mt-4 py-3.5 bg-white hover:bg-neutral-100 text-black text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSubmittingBooking ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <span>Request SAWAARI Auto</span>}
                  </button>
                </div>
              )}
            </div>
            
            {/* Quick Helper */}
            <div className="border-t border-border/50 pt-4 mt-auto">
              <span className="text-[10px] text-muted italic">Google Places Autocomplete suggestions will appear as you type. Real maps require a valid Google Maps API Key in `.env.local`.</span>
            </div>
          </div>
        )}

      </div>

      {/* RIGHT COLUMN: Google Maps Canvas */}
      <div className="flex-1 h-full bg-[#0F0F12]">
        <GoogleMapComponent
          center={mapCenter}
          zoom={14}
          markers={mapMarkers}
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          onMapClick={handleMapClick}
        />
      </div>

      {/* CANCELLATION DIALOG MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#0A0A0A] border border-border rounded-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-medium text-white">Cancel Ride Booking?</h3>
            <p className="text-xs text-muted">Please provide a brief reason for cancelling your booking.</p>
            <textarea
              rows={2}
              placeholder="Driver taking too long, changed my mind..."
              className="w-full bg-[#050505] border border-border rounded-lg p-3 text-xs text-white placeholder-muted focus:outline-none focus:border-primary transition-colors resize-none"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="w-1/2 py-2.5 bg-[#050505] text-muted border border-border text-xs font-semibold rounded-lg hover:text-white transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelRide}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
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
