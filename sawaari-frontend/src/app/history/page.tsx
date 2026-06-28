'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSawaariStore, RideDetails } from '../../lib/store';
import { api } from '../../lib/api';
import { 
  Calendar, MapPin, Star, IndianRupee, CheckCircle2, 
  XCircle, Clock, ArrowRight, ClipboardList 
} from 'lucide-react';

export default function RideHistoryPage() {
  const router = useRouter();
  const { user, token } = useSawaariStore();

  useEffect(() => {
    if (!token || !user) {
      router.push('/');
    }
  }, [token, user, router]);

  // Load ride history using TanStack React Query
  const { data: rides = [], isLoading, error } = useQuery<RideDetails[]>({
    queryKey: ['rides-history', user?.id],
    queryFn: () => api.get<RideDetails[]>('/rides/history'),
    enabled: !!token && !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#050505] flex items-center justify-center text-white">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
        <p className="text-sm">Retrieving Ride History...</p>
      </div>
    );
  }

  // Aggregations
  const completedRides = rides.filter((r) => r.status === 'completed');
  const cancelledRides = rides.filter((r) => r.status === 'cancelled');
  const totalAmount = completedRides.reduce((sum, r) => sum + Number(r.fare), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center space-x-1 text-xs text-green-400 bg-green-500/5 border border-green-500/10 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" />
            <span className="capitalize">{status}</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center space-x-1 text-xs text-red-400 bg-red-500/5 border border-red-500/10 px-2 py-0.5 rounded">
            <XCircle className="w-3 h-3" />
            <span className="capitalize">{status}</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-xs text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">
            <Clock className="w-3 h-3" />
            <span className="capitalize">{status.replace('_', ' ')}</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-[#050505] min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-light text-white tracking-tight">Ride History</h1>
            <p className="text-xs text-muted mt-1">Review all your previous journeys and financial statements.</p>
          </div>

          {/* Quick Stats Summary Card */}
          <div className="flex space-x-6 border border-border bg-[#0A0A0A] px-6 py-3.5 rounded-xl">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted uppercase">Total Rides</p>
              <p className="text-lg font-medium text-white">{completedRides.length}</p>
            </div>
            <div className="w-px bg-border my-1" />
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted uppercase">
                {user?.role === 'driver' ? 'Total Earnings' : 'Total Spends'}
              </p>
              <p className="text-lg font-medium text-white flex items-center">
                <IndianRupee className="w-4 h-4 mr-0.5" />
                {totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Ride list */}
        {rides.length === 0 ? (
          <div className="border border-border bg-[#0A0A0A] rounded-2xl py-16 text-center space-y-4">
            <ClipboardList className="w-12 h-12 text-muted mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No rides recorded</h3>
              <p className="text-xs text-muted">Complete your first booking to populate history records.</p>
            </div>
            <button
              onClick={() => router.push(user?.role === 'driver' ? '/driver' : '/passenger')}
              className="px-6 py-2.5 bg-primary text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {rides.map((ride) => {
              const formattedDate = new Date(ride.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div 
                  key={ride.id}
                  className="border border-border bg-[#0A0A0A] rounded-xl p-5 hover:border-neutral-800 transition-colors space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center space-x-3 text-xs text-muted">
                      <Calendar className="w-4 h-4" />
                      <span>{formattedDate}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(ride.status)}
                      <span className="text-sm font-bold text-white flex items-center">
                        <IndianRupee className="w-3 h-3 mr-0.5" />
                        {ride.fare}
                      </span>
                    </div>
                  </div>

                  {/* Journey Address Info */}
                  <div className="space-y-3 relative pl-4 border-l border-border">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-primary" />
                        <span>Pickup Location</span>
                      </span>
                      <p className="text-xs text-white line-clamp-1">{ride.pickupAddress}</p>
                    </div>

                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] text-muted flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-red-500" />
                        <span>Destination Location</span>
                      </span>
                      <p className="text-xs text-white line-clamp-1">{ride.dropoffAddress}</p>
                    </div>
                  </div>

                  {/* Card Footer details: Companion profile / review details */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-t border-border/50 pt-4 gap-4 text-xs">
                    
                    {/* User profile detail */}
                    {user?.role === 'passenger' && ride.driver ? (
                      <div className="text-muted">
                        <span>Driver: </span>
                        <span className="text-white font-medium">{ride.driver.user.name}</span>
                        <span className="mx-2 text-border">|</span>
                        <span>Auto Plate: </span>
                        <span className="text-white font-medium uppercase font-mono">{ride.driver.vehicleNo}</span>
                      </div>
                    ) : user?.role === 'driver' && ride.passenger ? (
                      <div className="text-muted">
                        <span>Passenger: </span>
                        <span className="text-white font-medium">{ride.passenger.name}</span>
                        <span className="mx-2 text-border">|</span>
                        <span>Phone: </span>
                        <span className="text-white font-medium">{ride.passenger.phone}</span>
                      </div>
                    ) : (
                      <div className="text-muted italic">
                        No companion linked (Unassigned or Cancelled)
                      </div>
                    )}

                    {/* Star Rating Review */}
                    {ride.rating && (
                      <div className="flex items-center space-x-2 bg-[#050505] border border-border px-3 py-1 rounded-md">
                        <span className="text-muted">Rated:</span>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              className={`w-3.5 h-3.5 ${star <= (ride.rating || 0) ? 'fill-accent stroke-accent' : 'text-neutral-800'}`} 
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {ride.review && (
                    <div className="bg-[#050505] p-3 rounded-lg border border-border/50 text-xs text-muted italic">
                      " {ride.review} "
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
