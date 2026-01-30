"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { SetPasswordForm } from "@/components/features/auth/SetPasswordForm";
import { ValidateInvitationResponse } from "@/types/team";

export default function SetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [invitation, setInvitation] = useState<ValidateInvitationResponse["invitation"] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("Invalid invitation link");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/team/invite/${token}`);
        const data: ValidateInvitationResponse = await response.json();

        if (data.valid && data.invitation) {
          setInvitation(data.invitation);
        } else {
          setError(data.error || "Invalid or expired invitation");
        }
      } catch (err) {
        console.error("Failed to validate invitation:", err);
        setError("Failed to validate invitation. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    validateToken();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-500 mt-4">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img
                src="/images/logo.svg"
                alt="PlanckOff"
                className="h-40 w-auto object-contain"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Invalid Invitation
              </h2>
              <p className="text-slate-500 mb-6">{error}</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="/images/logo.svg"
              alt="PlanckOff"
              className="h-40 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set Your Password</h1>
          <p className="text-slate-500 mt-1">
            Welcome, <span className="font-medium text-slate-700">{invitation?.name}</span>!
          </p>
          <p className="text-slate-500 text-sm mt-1">
            You&apos;re joining as <span className="font-medium text-blue-600">{invitation?.role}</span>
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <SetPasswordForm
            token={token}
            email={invitation?.email || ""}
            onSuccess={() => router.push("/login?registered=true")}
          />
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Drywall Estimator by PlanckOff
        </p>
      </div>
    </div>
  );
}
