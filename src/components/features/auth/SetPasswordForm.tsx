'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2, Check, Lock, Eye, EyeOff } from 'lucide-react';
import { PASSWORD_REQUIREMENTS, validatePassword } from '@/constants/roles';

interface SetPasswordFormProps {
  token: string;
  email: string;
  onSuccess?: () => void;
}

export function SetPasswordForm({ token, email, onSuccess }: SetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Real-time password validation
  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate password
    if (!passwordValidation.valid) {
      setError(passwordValidation.errors.join('. '));
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/team/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.();
      } else {
        setError(data.error || 'Failed to set password');
      }
    } catch (err) {
      console.error('Set password error:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Password requirement checks
  const requirements = [
    {
      met: password.length >= PASSWORD_REQUIREMENTS.minLength,
      text: `At least ${PASSWORD_REQUIREMENTS.minLength} characters`,
    },
    {
      met: /[A-Z]/.test(password),
      text: 'One uppercase letter',
    },
    {
      met: /[a-z]/.test(password),
      text: 'One lowercase letter',
    },
    {
      met: /\d/.test(password),
      text: 'One number',
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Email display (read-only) */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Email address
        </label>
        <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
          {email}
        </div>
      </div>

      {/* Password field */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
          Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-slate-400" />
          </div>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            required
            autoComplete="new-password"
            disabled={isLoading}
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Password requirements */}
        {password.length > 0 && (
          <div className="mt-2 space-y-1">
            {requirements.map((req, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 text-xs ${
                  req.met ? 'text-green-600' : 'text-slate-500'
                }`}
              >
                {req.met ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-current" />
                )}
                {req.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm password field */}
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
          Confirm Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-slate-400" />
          </div>
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
            autoComplete="new-password"
            disabled={isLoading}
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Password match indicator */}
        {confirmPassword.length > 0 && (
          <div
            className={`mt-2 flex items-center gap-2 text-xs ${
              passwordsMatch ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {passwordsMatch ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Passwords match
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                Passwords do not match
              </>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !passwordValidation.valid || !passwordsMatch}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            <Check className="w-5 h-5" />
            Create Account
          </>
        )}
      </button>
    </form>
  );
}
