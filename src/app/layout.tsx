import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PlanckOff Estimator',
  description: 'Professional drywall estimating software',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 min-h-screen`}>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
