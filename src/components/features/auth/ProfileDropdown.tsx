'use client';

import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigationLoading } from '@/context/NavigationLoadingContext';
import { useRouter } from 'next/navigation';

export function ProfileDropdown() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const { startNavigation } = useNavigationLoading();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    window.location.href = '/login';
  };

  const handleProfile = () => {
    setIsOpen(false);
    startNavigation('/profile');
    router.push('/profile');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="h-3 w-16 bg-slate-200 rounded animate-pulse mb-1"></div>
          <div className="h-4 w-20 bg-slate-200 rounded animate-pulse"></div>
        </div>
        <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-4 hover:opacity-90 transition-opacity"
      >
        <div className="text-right">
          <p className="text-xs text-slate-400 font-medium">Welcome,</p>
          <p className="text-sm font-bold text-slate-700">{user.name}</p>
        </div>
        <div className="relative">
          <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">
            {user.initials}
          </div>
          <ChevronDown className={`absolute -bottom-1 -right-1 w-4 h-4 text-slate-400 bg-white rounded-full transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-lg">
                {user.initials}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
                <p className="text-xs text-blue-600 font-medium mt-0.5">{user.role}</p>
              </div>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={handleProfile}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <User className="w-4 h-4" />
              Profile
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
