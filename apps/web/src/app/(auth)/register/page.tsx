import type { Metadata } from 'next';

import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a Bazaar account to track orders, save addresses and build a wishlist.',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
