'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSawaariStore } from '../../lib/store';
import { LogOut, User, Compass, History, ShieldAlert } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useSawaariStore();

  if (!user || !user.onboarded) return null; // Don't show on landing or onboarding screens

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  const navItems = [
    {
      name: 'Passenger Hub',
      path: '/passenger',
      icon: Compass,
      visible: user.role === 'passenger' || user.role === 'admin',
    },
    {
      name: 'Driver Hub',
      path: '/driver',
      icon: Compass,
      visible: user.role === 'driver' || user.role === 'admin',
    },
    {
      name: 'Ride History',
      path: '/history',
      icon: History,
      visible: true,
    },
    {
      name: 'Account Profile',
      path: '/profile',
      icon: User,
      visible: true,
    },
    {
      name: 'Admin Panel',
      path: '/admin',
      icon: ShieldAlert,
      visible: user.role === 'admin',
    },
  ];

  return (
    <header className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-lg font-extrabold tracking-[0.2em] text-primary transition-opacity duration-200 ease-out hover:opacity-90">
              SAWAARI
            </Link>
            <nav className="hidden md:flex space-x-2">
              {navItems
                .filter((item) => item.visible)
                .map((item) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-200 ease-out border ${
                        isActive
                          ? 'bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5'
                          : 'text-muted border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block space-y-0.5">
              <p className="text-xs font-semibold text-white tracking-wide">{user.name}</p>
              <p className="text-[9px] text-muted uppercase font-bold tracking-widest">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-muted hover:text-red-500 rounded-xl hover:bg-white/5 border border-transparent hover:border-border transition-all duration-200 ease-out"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation Header */}
        <div className="flex md:hidden border-t border-border/50 py-2 justify-around">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex flex-col items-center p-1 rounded-md text-[10px] transition-colors ${
                    isActive ? 'text-primary' : 'text-muted hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-0.5" />
                  <span>{item.name.split(' ')[0]}</span>
                </Link>
              );
            })}
        </div>
      </div>
    </header>
  );
}
