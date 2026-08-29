import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Bazaar account.',
};

export default function LoginPage() {
  // LoginForm reads `next` and `error` from the query string, so it has to be
  // behind a Suspense boundary for the shell to prerender.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
