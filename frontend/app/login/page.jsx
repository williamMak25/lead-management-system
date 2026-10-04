'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Signed-out visitors see the login form from AppShell on any path; Google sign-in errors
// land here as /login?error=…. Once signed in, there's nothing to show, so go home.
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => router.replace('/'), [router]);
  return null;
}
