import { AdminShell } from '@/components/admin/admin-shell';

/**
 * The admin shell.
 *
 * Deliberately plainer than the storefront header - no cart, no wishlist, no
 * product search. An operator working a queue does not need the shopping
 * chrome, and every control that is there is one they might hit by accident.
 *
 * Access is decided at the edge in `proxy.ts`, which verifies the refresh
 * cookie's signature and role before this renders at all; the API re-checks the
 * role on every request regardless.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
