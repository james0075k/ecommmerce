import type { Metadata } from 'next';

import { EditProductView } from './edit-product-view';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditProductView productId={id} />;
}
