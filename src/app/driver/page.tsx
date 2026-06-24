'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSawaariStore, RideDetails } from '../../lib/store';
import { api } from '../../lib/api';
import { getSocket, initializeSocket } from '../../lib/socket';
import dynamic from 'next/dynamic';
const GoogleMapComponent = dynamic(() => import('../../components/map/GoogleMapComponent'), { ssr: false });
import { 
  Power, Navigation, ShieldAlert, Award, Star, 
  MapPin, CheckCircle, IndianRupee, Compass, ChevronRight, Phone 
} from 'lucide-react';

export default function DriverDashboard() {
  const router = useRouter();
  const { user, token, activeRide, setActiveRide, isOnline, setIsOnline } = useSawaariStore();

  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Live offer state
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [offerTimer, setOfferTimer] = useState(15);
  
  // Trip actions
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isLoadingOtp, setIsLoadingOtp] = useState(false);
  const [earnings, setEarnings] = useState({ totalRides: 0, totalAmount: 0 });

  // Geolocation watch ID
  const watchIdRef = useRef<number | null>(null);

  // 1. Authenticated check
  useEffect(() => {
    if (!token || !user) {
      router.push('/');
    }
  }, [token, user, router]);

  // 2. Fetch driver profile & earnings on mount
  useEffect(() => {
    if (token) {
      setIsLoadingProfile(true);
      api.get<any>('/drivers/profile')
        .then((profile) => {
          setDriverProfile(profile);
          setIsOnline(profile.isOnline);
        })
        .catch((err) => {
          setErrorMessage(err.message || 'Failed to load driver profile. Ensure you are onboarded.');
        })
        .finally(() => {
          setIsLoadingProfile(false);
        });

      // Load active ride if any
      api.get<RideDetails | null>('/rides/active')
        .then((ride) => {
          if (ride) {
            setActiveRide(ride);
          }
        })
        .catch((err) => console.error('Failed to load active ride:', err));

      // Load historical earnings summary
      api.get<RideDetails[]>('/rides/history')
        .then((history) => {
          const completed = history.filter((r) => r.status === 'completed');
          const sum = completed.reduce((acc, curr) => acc + Number(curr.fare), 0);
          setEarnings({
            totalRides: completed.length,
            totalAmount: parseFloat(sum.toFixed(2)),
          });
        })
        .catch((err) => console.error('Failed to load earnings:', err));
    }
  }, [token, setActiveRide, setIsOnline]);

  // 3. Setup socket listeners for driver
  useEffect(() => {
    const socket = getSocket();
    if (!socket && token) {
      initializeSocket(token);
    }

    const currentSocket = getSocket();
    if (currentSocket) {
      currentSocket.on('ride_offer', (data: any) => {
        setIncomingOffer(data);
        setOfferTimer(15);
      });
    }

    return () => {
      if (currentSocket) {
        currentSocket.off('ride_offer');
      }
    };
  }, [token]);

  // 4. Timer for incoming ride offer
  useEffect(() => {
    if (!incomingOffer) return;
    if (offerTimer === 0) {
      setIncomingOffer(null);
      return;
    }

    const interval = setInterval(() => {
      setOfferTimer((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [incomingOffer, offerTimer]);

  // 5. Geolocation broadcast loop
  useEffect(() => {
    const socket = getSocket();
    if (isOnline && socket) {
      if (navigator.geolocation) {
        // Start watching driver GPS coordinates
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const coords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              bearing: position.coords.heading || 0,
            };
            
            // Broadcast via websockets
            socket.emit('driver_location_update', coords);
            console.log('📡 Broadcasted live coordinate to backend:', coords);
          },
          (err) => console.error('GPS Watch error:', err),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isOnline]);

  // 6. Go Online / Offline toggle
  const handleToggleOnline = async () => {
    const targetState = !isOnline;
    try {
      setErrorMessage('');
      const res = await api.put<any>('/drivers/status', { isOnline: targetState });
      setIsOnline(res.isOnline);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to update online status');
    }
  };

  // 7. Accept incoming offer
  const handleAcceptOffer = async () => {
    if (!incomingOffer) return;
    try {
      const ride = await api.post<RideDetails>(`/rides/${incomingOffer.rideId}/accept`, {});
      setActiveRide(ride);
      setIncomingOffer(null);
    } catch (e: any) {
      alert(e.message || 'Offer is no longer available');
      setIncomingOffer(null);
    }
  };

  // 8. Reject incoming offer
  const handleRejectOffer = () => {
    setIncomingOffer(null);
  };

  // 9. Driver marks Arrived
  const handleMarkArrived = async () => {
    if (!activeRide) return;
    try {
      const ride = await api.post<RideDetails>(`/rides/${activeRide.id}/arrive`, {});
      setActiveRide(ride);
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    }
  };

  // 10. Start Ride with OTP
  const handleStartRide = async () => {
    if (!activeRide || !otpValue) return;
    setIsLoadingOtp(true);
    setOtpError('');
    try {
      const ride = await api.post<RideDetails>(`/rides/${activeRide.id}/start`, {
        otp: otpValue,
      });
      setActiveRide(ride);
      setOtpValue('');
    } catch (e: any) {
      setOtpError(e.message || 'Incorrect OTP');
    } finally {
      setIsLoadingOtp(false);
    }
  };

  // 11. Complete Ride
  const handleCompleteRide = async () => {
    if (!activeRide) return;
    try {
      const ride = await api.post<RideDetails>(`/rides/${activeRide.id}/complete`, {});
      
      // Update local earnings count
      setEarnings((prev) => ({
        totalRides: prev.totalRides + 1,
        totalAmount: prev.totalAmount + Number(ride.fare),
      }));
      
      setActiveRide(null);
      alert('Trip completed successfully! Please collect Rs. ' + ride.fare);
    } catch (e: any) {
      alert(e.message || 'Failed to complete trip');
    }
  };

  // 12. Cancel Active Assignment
  const handleCancelAssignment = async () => {
    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`, {
        reason: 'Driver cancelled trip assignment',
      });
      setActiveRide(null);
    } catch (e: any) {
      alert(e.message || 'Failed to cancel');
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center text-white">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
        <p className="text-sm">Loading Driver Dashboard...</p>
      </div>
    );
  }

  if (errorMessage && !driverProfile) {
    return (
      <div className="h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="text-sm font-medium">{errorMessage}</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2.5 bg-primary text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
        >
          Go to Onboarding
        </button>
      </div>
    );
  }

  // Derived variables
  const hasRide = !!activeRide;
  const isAccepted = activeRide?.status === 'accepted';
  const isArrived = activeRide?.status === 'arrived';
  const isInProgress = activeRide?.status === 'in_progress';

  // Map variables
  const pickupCoords = activeRide ? {
    lat: activeRide.pickupLocation.coordinates[1],
    lng: activeRide.pickupLocation.coordinates[0],
  } : null;

  const dropoffCoords = activeRide ? {
    lat: activeRide.dropoffLocation.coordinates[1],
    lng: activeRide.dropoffLocation.coordinates[0],
  } : null;

  const mapCenter = pickupCoords || { lat: 12.9716, lng: 77.5946 };

  const mapMarkers = [];
  if (pickupCoords) {
    mapMarkers.push({
      id: 'pickup',
      position: pickupCoords,
      iconType: 'passenger' as const,
      title: 'Passenger Location',
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

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row relative">
      
      {/* LEFT COLUMN: Driver control & details Panel */}
      <div className="w-full md:w-[420px] bg-[#050505] border-r border-border flex flex-col justify-between overflow-y-auto z-10">
        
        <div className="p-6 space-y-6 flex-1">
          
          {/* Header Panel */}
          <div className="flex justify-between items-center pb-4 border-b border-border/50">
            <div>
              <h2 className="text-xl font-light text-white">Driver Portal</h2>
              <p className="text-[10px] text-muted tracking-wider uppercase mt-0.5">{driverProfile.vehicleNo}</p>
            </div>
            
            {/* Online / Offline switch */}
            <button
              onClick={handleToggleOnline}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                isOnline 
                  ? 'bg-green-600/10 text-green-400 border border-green-500/20' 
                  : 'bg-[#0A0A0A] text-muted border border-border hover:text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
          </div>

          {errorMessage && <p className="text-xs text-red-500 bg-red-500/5 border border-red-500/10 p-3 rounded">{errorMessage}</p>}

          {/* Active Job State */}
          {hasRide ? (
            <div className="space-y-6">
              
              {/* State Header */}
              <div className="space-y-1">
                <span className="bg-primary text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase">
                  Active Ride
                </span>
                <h3 className="text-base font-medium text-white mt-2">
                  {isAccepted && 'Drive to passenger pickup point'}
                  {isArrived && 'Verify passenger OTP'}
                  {isInProgress && 'Journey commenced'}
                </h3>
              </div>

              {/* Passenger Info card */}
              {activeRide.passenger && (
                <div className="border border-border bg-[#0A0A0A] rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wide">Passenger</p>
                      <p className="text-sm font-semibold text-white mt-0.5">{activeRide.passenger.name}</p>
                    </div>
                    <a
                      href={`tel:${activeRide.passenger.phone}`}
                      className="p-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-full text-primary transition-colors"
                      title="Call Passenger"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted">Pickup Location</p>
                    <p className="text-xs text-white line-clamp-2">{activeRide.pickupAddress}</p>
                  </div>
                  
                  {isInProgress && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <p className="text-[10px] text-muted">Destination Location</p>
                      <p className="text-xs text-white line-clamp-2">{activeRide.dropoffAddress}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Ride OTP Validation Form */}
              {isArrived && (
                <div className="border border-border bg-[#0A0A0A] p-5 rounded-xl space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">Request 4-digit OTP from passenger</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="0000"
                      className="w-full bg-[#050505] border border-border rounded-lg py-3 text-center text-xl font-bold tracking-[0.5em] text-white focus:outline-none focus:border-primary transition-colors"
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value)}
                    />
                  </div>
                  {otpError && <p className="text-xs text-red-500 text-center">{otpError}</p>}
                  
                  <button
                    onClick={handleStartRide}
                    disabled={isLoadingOtp || otpValue.length < 4}
                    className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoadingOtp ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Start Ride Journey</span>}
                  </button>
                </div>
              )}

              {/* Lifecycle Actions */}
              <div className="space-y-3">
                {isAccepted && (
                  <button
                    onClick={handleMarkArrived}
                    className="w-full py-3.5 bg-white hover:bg-neutral-100 text-black text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-all active:scale-[0.99]"
                  >
                    <span>I have Arrived at Pickup</span>
                  </button>
                )}

                {isInProgress && (
                  <button
                    onClick={handleCompleteRide}
                    className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Complete Ride Journey</span>
                  </button>
                )}

                <button
                  onClick={handleCancelAssignment}
                  className="w-full py-3 bg-[#0A0A0A] border border-border text-muted hover:text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel Assignment
                </button>
              </div>

            </div>
          ) : (
            // Offline or Idle Waiting view
            <div className="space-y-6">
              {!isOnline ? (
                <div className="border border-border bg-[#0A0A0A] p-6 rounded-xl text-center space-y-4">
                  <div className="w-12 h-12 bg-muted/10 border border-border rounded-full flex items-center justify-center mx-auto text-muted">
                    <Power className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">You are Offline</h3>
                    <p className="text-xs text-muted">Go online to begin receiving passenger ride requests in your area.</p>
                  </div>
                </div>
              ) : (
                <div className="border border-green-500/20 bg-green-500/[0.02] p-6 rounded-xl text-center space-y-4 animate-pulse">
                  <div className="w-12 h-12 bg-green-600/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto text-green-400">
                    <Compass className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">Looking for passenger requests...</h3>
                    <p className="text-xs text-muted">Broadcasting your live GPS position. Keep this browser window open.</p>
                  </div>
                </div>
              )}

              {/* Driver Stats overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border bg-[#0A0A0A] p-4 rounded-xl space-y-1">
                  <span className="text-[10px] text-muted uppercase">Today's Trips</span>
                  <p className="text-2xl font-light text-white">{earnings.totalRides}</p>
                </div>
                <div className="border border-border bg-[#0A0A0A] p-4 rounded-xl space-y-1">
                  <span className="text-[10px] text-muted uppercase">Total Earned</span>
                  <p className="text-2xl font-light text-white flex items-center"><IndianRupee className="w-5 h-5 mr-0.5" />{earnings.totalAmount}</p>
                </div>
              </div>
              
              <div className="border border-border bg-[#0A0A0A] p-4 rounded-xl flex items-center justify-between">
                <span className="text-xs text-muted">Driver Rating</span>
                <span className="text-xs text-accent font-semibold flex items-center">
                  <Star className="w-4 h-4 fill-accent stroke-accent mr-1" />
                  {driverProfile.rating}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Quick Helper */}
        <div className="p-6 border-t border-border/50">
          <span className="text-[10px] text-muted italic">Live locations are simulated using the browser GPS watcher. Ensure you give browser location permissions for maps to run.</span>
        </div>

      </div>

      {/* RIGHT COLUMN: Google Maps Canvas */}
      <div className="flex-1 h-full bg-[#0F0F12]">
        <GoogleMapComponent
          center={mapCenter}
          zoom={14}
          markers={mapMarkers}
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          hasActiveRide={!!activeRide}
        />
      </div>

      {/* RIDE OFFER POPUP SHEET OVERLAY */}
      {incomingOffer && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#0A0A0A] border border-primary/20 rounded-2xl max-w-sm w-full p-6 space-y-6 text-center shadow-2xl">
            <div className="space-y-1">
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase">
                New Offer Incoming
              </span>
              <h3 className="text-xl font-light text-white mt-3">Sawaari Auto Requested</h3>
            </div>

            <div className="border border-border bg-[#050505] p-4 rounded-xl text-left space-y-3">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-border/50">
                <span className="text-muted">Est. Earning</span>
                <span className="text-base font-bold text-green-400 flex items-center"><IndianRupee className="w-3.5 h-3.5 mr-0.5" />{incomingOffer.fare}</span>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-muted uppercase">Pickup Location</p>
                <p className="text-xs text-white line-clamp-2">{incomingOffer.pickupAddress}</p>
              </div>
              <div className="space-y-1 border-t border-border/50 pt-2">
                <p className="text-[9px] text-muted uppercase">Destination Location</p>
                <p className="text-xs text-white line-clamp-2">{incomingOffer.dropoffAddress}</p>
              </div>
            </div>

            {/* Accept Timer Countdown */}
            <div className="space-y-1">
              <div className="w-full bg-[#1C1C1E] h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-1000" 
                  style={{ width: `${(offerTimer / 15) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted">Expires in {offerTimer} seconds</p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={handleRejectOffer}
                className="w-1/2 py-3 bg-[#050505] border border-border text-muted hover:text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Reject Offer
              </button>
              <button
                type="button"
                onClick={handleAcceptOffer}
                className="w-1/2 py-3 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Accept Offer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
