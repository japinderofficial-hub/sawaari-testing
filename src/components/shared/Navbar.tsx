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
    <header className="border-b border-border bg-[#050505] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold tracking-wider text-primary">
              SAWAARI
            </Link>
            <nav className="hidden md:flex space-x-1">
              {navItems
                .filter((item) => item.visible)
                .map((item) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#0A0A0A] text-primary border border-border'
                          : 'text-muted hover:text-white hover:bg-[#0A0A0A]/50'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white">{user.name}</p>
              <p className="text-[10px] text-muted capitalize">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-muted hover:text-red-500 rounded-md hover:bg-[#0A0A0A] transition-colors"
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
