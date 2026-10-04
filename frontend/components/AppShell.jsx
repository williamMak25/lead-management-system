'use client';

import { Suspense } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { MetaProvider } from '@/context/MetaContext';
import Sidebar from '@/components/Sidebar';
import Login from '@/views/Login';

function Gate({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-sm text-ink-muted">Loading…</div>;
  }

  if (!user) {
    // Login reads ?error= from Google sign-in redirects, which needs a Suspense boundary in Next
    return (
      <Suspense>
        <Login />
      </Suspense>
    );
  }

  return (
    <MetaProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </MetaProvider>
  );
}

export default function AppShell({ children }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
