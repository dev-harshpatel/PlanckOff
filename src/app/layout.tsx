import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { RouteTransitionIndicator } from '@/components/layout/RouteTransitionIndicator';
import { AuthProvider } from '@/context/AuthContext';
import { NavigationLoadingProvider } from '@/context/NavigationLoadingContext';
import { ToastProvider } from '@/components/ui';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

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
        <NavigationLoadingProvider>
          <AuthProvider>
            <ToastProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </ToastProvider>
          </AuthProvider>
          <RouteTransitionIndicator />
        </NavigationLoadingProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
