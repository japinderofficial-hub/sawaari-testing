'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSawaariStore } from '../../lib/store';
import { api } from '../../lib/api';
import { 
  ShieldAlert, User, ShieldCheck, Eye, 
  ThumbsUp, ThumbsDown, Star, RefreshCw, IndianRupee, Compass 
} from 'lucide-react';

interface DriverProfile {
  id: string;
  vehicleNo: string;
  vehicleModel: string;
  status: 'active' | 'suspended' | 'pending_approval';
  rating: number;
  user: {
    name: string;
    phone: string;
  };
  documents: {
    id: string;
    type: 'license' | 'permit' | 'registration' | 'aadhaar' | 'vehicle_photo';
    url: string;
    status: 'pending' | 'approved' | 'rejected';
    comments?: string;
  }[];
}

interface ActiveRide {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  passenger: {
    name: string;
    phone: string;
  };
  driver?: {
    vehicleNo: string;
    user: {
      name: string;
    };
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, token } = useSawaariStore();

  const [selectedDriver, setSelectedDriver] = useState<DriverProfile | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    if (!token || !user || user.role !== 'admin') {
      router.push('/');
    }
  }, [token, user, router]);

  // Query: Pending approval driver documents
  const { data: drivers = [], isLoading: isLoadingDrivers, refetch: refetchDrivers } = useQuery<DriverProfile[]>({
    queryKey: ['admin-pending-drivers', user?.id],
    queryFn: () => api.get<DriverProfile[]>('/admin/drivers/pending'),
    enabled: !!token && user?.role === 'admin',
  });

  // Query: Current active rides in system
  const { data: activeRides = [], isLoading: isLoadingRides, refetch: refetchRides } = useQuery<ActiveRide[]>({
    queryKey: ['admin-active-rides', user?.id],
    queryFn: () => api.get<ActiveRide[]>('/admin/rides/active'),
    enabled: !!token && user?.role === 'admin',
    refetchInterval: 5000, // Auto refresh every 5 seconds for live tracking dashboard
  });

  // Mutation: Document Review
  const documentReviewMutation = useMutation({
    mutationFn: (data: { docId: string; status: 'approved' | 'rejected'; comments?: string }) =>
      api.post(`/admin/documents/${data.docId}/review`, {
        status: data.status,
        comments: data.comments,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-drivers'] });
      setReviewComment('');
      // Update selected driver state in place
      if (selectedDriver) {
        refetchDrivers().then((res) => {
          const updated = res.data?.find((d) => d.id === selectedDriver.id);
          setSelectedDriver(updated || null);
        });
      }
      alert('Document review recorded!');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to submit document review');
    },
  });

  // Mutation: Manually override Driver profile status
  const driverStatusMutation = useMutation({
    mutationFn: (data: { driverId: string; status: 'active' | 'suspended' }) =>
      api.put(`/admin/drivers/${data.driverId}/status`, { status: data.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-drivers'] });
      refetchDrivers().then((res) => {
        const updated = res.data?.find((d) => d.id === selectedDriver?.id);
        setSelectedDriver(updated || null);
      });
      alert('Driver profile status updated!');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update driver status');
    },
  });

  const handleReviewDocument = (docId: string, status: 'approved' | 'rejected') => {
    documentReviewMutation.mutate({
      docId,
      status,
      comments: status === 'rejected' ? reviewComment : undefined,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'approved':
        return 'text-green-400 bg-green-500/5 border-green-500/10';
      case 'suspended':
      case 'rejected':
        return 'text-red-400 bg-red-500/5 border-red-500/10';
      default:
        return 'text-accent bg-accent/5 border-accent/10';
    }
  };

  return (
    <div className="bg-[#050505] min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Title */}
        <div className="flex justify-between items-center pb-4 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-light text-white tracking-tight">Admin Console</h1>
            <p className="text-xs text-muted mt-1">Audit driver registrations, approve licenses, and oversee active trips.</p>
          </div>
          <button
            onClick={() => { refetchDrivers(); refetchRides(); }}
            className="p-2 border border-border bg-[#0A0A0A] hover:bg-[#151515] rounded text-primary transition-all"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Dashboard Grid split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* COLUMN 1: Drivers List & Review Section (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-medium text-white">Driver Approval Queue</h2>
              
              {isLoadingDrivers ? (
                <div className="h-20 bg-border/20 rounded animate-pulse" />
              ) : drivers.length === 0 ? (
                <p className="text-xs text-muted italic">No drivers found in system</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-muted">
                    <thead>
                      <tr className="border-b border-border/50 pb-2 text-[10px] uppercase text-muted">
                        <th className="py-2">Driver Name</th>
                        <th className="py-2">Plate No</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Documents</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((driver) => (
                        <tr key={driver.id} className="border-b border-border/30 hover:bg-[#111]/30">
                          <td className="py-3 text-white font-medium">{driver.user.name}</td>
                          <td className="py-3 font-mono uppercase">{driver.vehicleNo}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded border text-[9px] capitalize ${getStatusColor(driver.status)}`}>
                              {driver.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 space-x-1">
                            {driver.documents.map((doc) => (
                              <span 
                                key={doc.id}
                                className={`px-1 py-0.5 rounded text-[8px] border uppercase ${
                                  doc.status === 'approved' 
                                    ? 'text-green-400 bg-green-500/5 border-green-500/10' 
                                    : doc.status === 'rejected'
                                    ? 'text-red-400 bg-red-500/5 border-red-500/10'
                                    : 'text-accent bg-accent/5 border-accent/10'
                                }`}
                              >
                                {doc.type.charAt(0)}
                              </span>
                            ))}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => setSelectedDriver(driver)}
                              className="px-2.5 py-1 bg-[#050505] border border-border text-primary hover:text-white rounded flex items-center space-x-1 ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Audit</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Audit Inspector Panel */}
            {selectedDriver && (
              <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-6 animate-fadeIn">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold text-white">Reviewing: {selectedDriver.user.name}</h3>
                    <p className="text-xs text-muted mt-0.5">Phone: {selectedDriver.user.phone} | Vehicle: {selectedDriver.vehicleModel}</p>
                  </div>
                  <div className="flex space-x-2">
                    {selectedDriver.status !== 'active' && (
                      <button
                        onClick={() => driverStatusMutation.mutate({ driverId: selectedDriver.id, status: 'active' })}
                        className="px-3 py-1 bg-green-600/15 border border-green-500/30 text-green-400 hover:bg-green-600/30 text-[10px] font-bold rounded"
                      >
                        Activate Profile
                      </button>
                    )}
                    {selectedDriver.status !== 'suspended' && (
                      <button
                        onClick={() => driverStatusMutation.mutate({ driverId: selectedDriver.id, status: 'suspended' })}
                        className="px-3 py-1 bg-red-600/15 border border-red-500/30 text-red-400 hover:bg-red-600/30 text-[10px] font-bold rounded"
                      >
                        Suspend Driver
                      </button>
                    )}
                    <button onClick={() => setSelectedDriver(null)} className="p-1 hover:bg-[#151515] border border-border text-muted hover:text-white rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Uploaded Documents List inside Inspector */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-white">Driver Uploaded Documents</p>
                  {selectedDriver.documents.length === 0 ? (
                    <p className="text-xs text-muted italic">No documents uploaded yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedDriver.documents.map((doc) => (
                        <div key={doc.id} className="border border-border bg-[#050505] p-4 rounded-lg space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white uppercase">{doc.type.replace('_', ' ')} Document</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] uppercase border ${getStatusColor(doc.status)}`}>
                              {doc.status}
                            </span>
                          </div>
                          
                          {/* Live document link preview */}
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="block h-32 w-full bg-[#0A0A0A] border border-border rounded flex items-center justify-center text-xs text-primary hover:underline hover:bg-[#151515] transition-colors"
                          >
                            <span>Open Attachment Link</span>
                          </a>

                          {doc.comments && (
                            <p className="text-[10px] text-red-400 italic bg-red-500/[0.02] p-2 rounded">Note: {doc.comments}</p>
                          )}

                          {doc.status === 'pending' && (
                            <div className="space-y-2 pt-2 border-t border-border/50">
                              <input
                                type="text"
                                placeholder="Reason if rejecting..."
                                className="w-full bg-[#0A0A0A] border border-border rounded p-2 text-[10px] text-white focus:outline-none focus:border-primary"
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleReviewDocument(doc.id, 'approved')}
                                  className="w-1/2 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold rounded flex items-center justify-center space-x-1"
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => handleReviewDocument(doc.id, 'rejected')}
                                  className="w-1/2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold rounded flex items-center justify-center space-x-1"
                                >
                                  <ThumbsDown className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: System Active Rides Table (1/3 width) */}
          <div className="space-y-6">
            <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-medium text-white flex items-center space-x-2">
                <Compass className="w-5 h-5 text-primary" />
                <span>Live Rides Oversights</span>
              </h2>

              {isLoadingRides ? (
                <div className="space-y-2">
                  <div className="h-10 bg-border/20 rounded animate-pulse" />
                  <div className="h-10 bg-border/20 rounded animate-pulse" />
                </div>
              ) : activeRides.length === 0 ? (
                <p className="text-xs text-muted italic py-4 text-center">No active rides in progress</p>
              ) : (
                <div className="space-y-3">
                  {activeRides.map((ride) => (
                    <div 
                      key={ride.id}
                      className="border border-border/50 bg-[#050505] p-4 rounded-lg space-y-3 text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white">{ride.passenger.name}</span>
                        <span className="text-[10px] text-green-400 font-bold flex items-center">
                          <IndianRupee className="w-3 h-3 mr-0.5" />
                          {ride.fare}
                        </span>
                      </div>
                      
                      <div className="space-y-1 relative pl-3 border-l border-border text-[10px] text-muted">
                        <p className="line-clamp-1"><strong className="text-white">P:</strong> {ride.pickupAddress}</p>
                        <p className="line-clamp-1"><strong className="text-white">D:</strong> {ride.dropoffAddress}</p>
                      </div>

                      <div className="flex justify-between items-center border-t border-border/30 pt-2 text-[10px]">
                        <span className="text-muted font-mono">
                          {ride.driver ? `Auto: ${ride.driver.vehicleNo}` : 'Driver Searching...'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border uppercase text-[8px] font-bold ${getStatusColor(ride.status)}`}>
                          {ride.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// Simple placeholder X icon if lucide isn't mapping
function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
