'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSawaariStore } from '../../lib/store';
import { api } from '../../lib/api';
import { 
  User, Mail, Phone, Home, Briefcase, Clock, MapPin, 
  Trash2, Plus, Star, ShieldCheck, Clock3, AlertCircle, Compass 
} from 'lucide-react';

interface SavedLoc {
  id: string;
  name: string;
  type: 'home' | 'work' | 'recent';
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, token, updateUser } = useSawaariStore();

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // New location fields
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState<'home' | 'work' | 'recent'>('recent');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [isAddingLoc, setIsAddingLoc] = useState(false);

  useEffect(() => {
    if (!token || !user) {
      router.push('/');
    } else {
      setEditName(user.name || '');
    }
  }, [token, user, router]);

  // Load user profile details from backend
  const { data: dbUser } = useQuery<any>({
    queryKey: ['profile-details', user?.id],
    queryFn: () => api.get<any>('/users/profile'),
    enabled: !!token && !!user,
  });

  useEffect(() => {
    if (dbUser) {
      setEditEmail(dbUser.email || '');
    }
  }, [dbUser]);

  // Load saved locations from backend
  const { data: locations = [], isLoading: isLoadingLocs } = useQuery<SavedLoc[]>({
    queryKey: ['saved-locations', user?.id],
    queryFn: () => api.get<SavedLoc[]>('/users/locations'),
    enabled: !!token && !!user,
  });

  // Add location mutation
  const addLocationMutation = useMutation({
    mutationFn: (newLoc: { name: string; type: string; address: string; latitude: number; longitude: number }) =>
      api.post<SavedLoc>('/users/locations', newLoc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
      setNewLocName('');
      setNewLocAddress('');
      setIsAddingLoc(false);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to save location');
    },
  });

  // Delete location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete location');
    },
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateSuccess(false);
    try {
      const res = await api.put<any>('/users/profile', {
        name: editName,
        email: editEmail,
      });
      updateUser({ name: res.name });
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (e: any) {
      alert(e.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName || !newLocAddress) return;

    // Simulate coordinates (in real app, we geocode this address)
    addLocationMutation.mutate({
      name: newLocName,
      type: newLocType,
      address: newLocAddress,
      latitude: 12.9716,
      longitude: 77.5946,
    });
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case 'home':
        return <Home className="w-4 h-4 text-primary" />;
      case 'work':
        return <Briefcase className="w-4 h-4 text-primary" />;
      default:
        return <Clock className="w-4 h-4 text-muted" />;
    }
  };

  return (
    <div className="bg-[#050505] min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Profile Details Column (2/3 width) */}
        <div className="md:col-span-2 space-y-6">
          
          <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-6">
            <h2 className="text-xl font-light text-white tracking-tight flex items-center space-x-2">
              <User className="w-5 h-5 text-primary" />
              <span>Personal Details</span>
            </h2>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-muted">Mobile Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    disabled
                    className="w-full bg-[#050505] border border-border/50 rounded-lg py-2.5 pl-10 pr-4 text-xs text-muted cursor-not-allowed"
                    value={user?.phone || ''}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Enter name"
                    className="w-full bg-[#050505] border border-border rounded-lg py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    className="w-full bg-[#050505] border border-border rounded-lg py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>

              {updateSuccess && (
                <p className="text-xs text-green-400 bg-green-500/5 border border-green-500/10 p-2.5 rounded">
                  Profile updated successfully!
                </p>
              )}

              <button
                type="submit"
                disabled={isUpdating}
                className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {isUpdating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Profile Changes</span>}
              </button>
            </form>
          </div>

          {/* Driver specific info card */}
          {user?.role === 'driver' && dbUser?.driverProfile && (
            <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-6">
              <h2 className="text-xl font-light text-white tracking-tight flex items-center space-x-2">
                <Compass className="w-5 h-5 text-primary" />
                <span>Vehicle Profile</span>
              </h2>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-muted">Vehicle License Plate</span>
                  <p className="text-sm font-semibold text-white uppercase tracking-wider font-mono">{dbUser.driverProfile.vehicleNo}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted">Vehicle Model</span>
                  <p className="text-sm font-semibold text-white">{dbUser.driverProfile.vehicleModel}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted">Driver Status</span>
                  <p className="text-sm font-semibold text-white capitalize flex items-center space-x-1">
                    {dbUser.driverProfile.status === 'active' ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-green-400 inline mr-1" />
                        <span className="text-green-400">Approved</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-accent inline mr-1" />
                        <span className="text-accent">Pending Approval</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted">Aggregate Rating</span>
                  <p className="text-sm font-semibold text-white flex items-center">
                    <Star className="w-3.5 h-3.5 fill-accent stroke-accent mr-1" />
                    {dbUser.driverProfile.rating}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Saved Locations Column (1/3 width) */}
        <div className="space-y-6">
          <div className="border border-border bg-[#0A0A0A] rounded-xl p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-light text-white tracking-tight">Saved Locations</h2>
              <button
                onClick={() => setIsAddingLoc(!isAddingLoc)}
                className="p-1 hover:bg-[#151515] rounded text-primary border border-border"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Toggle Add Location Form */}
            {isAddingLoc && (
              <form onSubmit={handleAddLocationSubmit} className="border border-border/80 p-4 rounded-lg bg-[#050505] space-y-3 animate-fadeIn">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted uppercase">Label Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Home, Office, Gym"
                    className="w-full bg-[#0A0A0A] border border-border rounded-lg p-2 text-xs text-white placeholder-muted focus:outline-none focus:border-primary"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted uppercase">Location Type</label>
                  <select
                    className="w-full bg-[#0A0A0A] border border-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-primary"
                    value={newLocType}
                    onChange={(e) => setNewLocType(e.target.value as any)}
                  >
                    <option value="home">Home</option>
                    <option value="work">Work</option>
                    <option value="recent">Recent</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted uppercase">Address Location</label>
                  <input
                    type="text"
                    required
                    placeholder="Search address..."
                    className="w-full bg-[#0A0A0A] border border-border rounded-lg p-2 text-xs text-white placeholder-muted focus:outline-none focus:border-primary"
                    value={newLocAddress}
                    onChange={(e) => setNewLocAddress(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={addLocationMutation.isPending}
                  className="w-full py-2 bg-primary hover:bg-primary-dark text-white text-[10px] font-bold tracking-wider uppercase rounded transition-colors disabled:opacity-50"
                >
                  {addLocationMutation.isPending ? 'Saving...' : 'Add Location'}
                </button>
              </form>
            )}

            {/* Locations List */}
            {isLoadingLocs ? (
              <div className="space-y-3">
                <div className="h-10 bg-border/20 rounded animate-pulse" />
                <div className="h-10 bg-border/20 rounded animate-pulse" />
              </div>
            ) : locations.length === 0 ? (
              <p className="text-xs text-muted italic text-center py-4">No saved locations.</p>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => (
                  <div 
                    key={loc.id}
                    className="flex justify-between items-start border border-border/50 bg-[#050505] p-3 rounded-lg hover:border-neutral-800 transition-colors"
                  >
                    <div className="flex space-x-3">
                      <div className="p-2 bg-[#0A0A0A] border border-border rounded-md shrink-0">
                        {getLocationIcon(loc.type)}
                      </div>
                      <div className="space-y-0.5 text-left">
                        <span className="text-xs font-semibold text-white capitalize">{loc.name}</span>
                        <p className="text-[10px] text-muted line-clamp-1">{loc.address}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteLocationMutation.mutate(loc.id)}
                      className="p-1.5 text-muted hover:text-red-500 transition-colors"
                      title="Delete Location"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
