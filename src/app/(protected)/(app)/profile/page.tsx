'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormField } from '@/components/ui';
import { RouteGuard } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';
import type { ChangePasswordRequest, ProfileResponse, UpdateProfileRequest } from '@/types/profile';

const getDefaultInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();

export default function ProfilePage() {
  const { user, refreshSession } = useAuth();
  const [profileForm, setProfileForm] = useState({
    name: '',
    initials: '',
  });
  const [passwordForm, setPasswordForm] = useState<ChangePasswordRequest>({
    currentPassword: '',
    newPassword: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name,
      initials: user.initials,
    });
  }, [user]);

  const derivedInitials = useMemo(
    () => getDefaultInitials(profileForm.name || user?.name || ''),
    [profileForm.name, user?.name],
  );

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    setIsSavingProfile(true);

    try {
      const payload: UpdateProfileRequest = {
        name: profileForm.name,
        initials: profileForm.initials,
      };

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data: ProfileResponse = await response.json();

      if (!response.ok || !data.success) {
        setProfileError(data.error || 'Failed to update profile');
        return;
      }

      await refreshSession(false);
      setProfileMessage('Profile updated successfully.');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setProfileError('An unexpected error occurred.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    setIsSavingPassword(true);

    try {
      const response = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(passwordForm),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setPasswordError(data.error || 'Failed to update password');
        return;
      }

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
      });
      setPasswordMessage(data.message || 'Password updated successfully.');
    } catch (error) {
      console.error('Failed to update password:', error);
      setPasswordError('An unexpected error occurred.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <RouteGuard path="/profile">
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Account
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile Settings</h1>
            <p className="max-w-2xl text-sm text-slate-500">
              Manage your display information and keep your password current without touching team permissions.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <UserRound className="h-5 w-5 text-blue-600" />
                  Personal Details
                </CardTitle>
                <CardDescription>
                  Update how your name appears across the app. Email and role stay read-only here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label="Full Name"
                      type="text"
                      required
                      value={profileForm.name}
                      onChange={(event) =>
                        setProfileForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                    <FormField
                      label="Initials"
                      type="text"
                      value={profileForm.initials}
                      placeholder={derivedInitials}
                      onChange={(event) =>
                        setProfileForm((prev) => ({ ...prev, initials: event.target.value.toUpperCase() }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Email" type="email" value={user?.email || ''} disabled />
                    <FormField label="Role" type="text" value={user?.role || ''} disabled />
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4" />
                      {profileError}
                    </div>
                  )}

                  {profileMessage && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {profileMessage}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" variant="primary" isLoading={isSavingProfile}>
                      Save Profile
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <KeyRound className="h-5 w-5 text-amber-600" />
                    Password
                  </CardTitle>
                  <CardDescription>
                    Use your current password to confirm this change.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordSave} className="space-y-4">
                    <FormField
                      label="Current Password"
                      type="password"
                      required
                      value={passwordForm.currentPassword}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          currentPassword: event.target.value,
                        }))
                      }
                    />
                    <FormField
                      label="New Password"
                      type="password"
                      required
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          newPassword: event.target.value,
                        }))
                      }
                    />

                    {passwordError && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4" />
                        {passwordError}
                      </div>
                    )}

                    {passwordMessage && (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {passwordMessage}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button type="submit" variant="primary" isLoading={isSavingPassword}>
                        Update Password
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-900 text-slate-50 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-50">
                    <ShieldCheck className="h-5 w-5 text-emerald-300" />
                    Account Notes
                  </CardTitle>
                  <CardDescription className="text-slate-300">
                    Team permissions and role assignment remain managed centrally.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-200">
                  <p>Your role controls access to admin, team, and database areas.</p>
                  <p>For email or role changes, use Team Management or contact an administrator.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </RouteGuard>
  );
}
