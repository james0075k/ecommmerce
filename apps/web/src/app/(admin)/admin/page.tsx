import { redirect } from 'next/navigation';

/**
 * `/admin` is not a page of its own - it is the door. The dashboard is what an
 * operator wants when they type the bare path, and a permanent redirect keeps
 * any bookmark pointing at it valid.
 */
export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
