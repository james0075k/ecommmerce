import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ConfirmationView } from './confirmation-view';

export const metadata: Metadata = {
  title: 'Order confirmed',
  // A personal order page has nothing to offer a search engine (J2).
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <ConfirmationView orderId={id} />
    </Suspense>
  );
}
