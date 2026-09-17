import type { ReactNode } from 'react'
import { ContainerOutlined, DatabaseOutlined, FileDoneOutlined } from '@ant-design/icons'
import type { ProfileRole } from '../../../pages/login/auth-useQuery'

export type NavItem = {
  key: string
  path: string
  label: string
  icon: ReactNode
  roles: ProfileRole[]
  /**
   * Extra path prefixes this entry owns — routes that exist in the router but
   * aren't nav destinations of their own, e.g. /payroll-details/:id belongs to
   * Payroll. Without this the guard would treat them as unknown and deny them.
   */
  match?: string[]
}

/**
 * The single source of truth for which roles may see which page: the sidebar,
 * the post-login landing redirect, and the AppLayout route guard all read from
 * here, so "who may see what" is written once.
 *
 * Order is meaningful — it's both the sidebar order and the priority order
 * `getLandingPath` walks to pick where a role lands after login.
 *
 * These roles mirror the Supabase RLS policies; they do not replace them. The
 * guard built on this config is client-side UX and defense-in-depth only.
 */
export const NAV_ITEMS: NavItem[] = [
  // /containers/items (register shipment) is owned by this entry via prefix match.
  { key: 'containers', path: '/containers', label: 'Shipments', icon: <ContainerOutlined />, roles: ['warehouse_admin'] },
  { key: 'stock',      path: '/stock',      label: 'Stock',     icon: <DatabaseOutlined />,  roles: ['warehouse_admin'] },
  { key: 'order-slip', path: '/order-slip', label: 'Order Slips', icon: <FileDoneOutlined />, roles: ['warehouse_admin'] },
]

/** True when `pathname` is `prefix` itself or a route nested under it. */
const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

/**
 * The nav entry that owns `pathname`, or null if no entry claims it. Longest
 * matching prefix wins so a more specific entry can't be shadowed by a shorter
 * one that happens to share its start.
 */
export function navItemForPath(pathname: string): NavItem | null {
  let best: NavItem | null = null
  let bestLength = -1

  for (const item of NAV_ITEMS) {
    for (const prefix of [item.path, ...(item.match ?? [])]) {
      if (matchesPrefix(pathname, prefix) && prefix.length > bestLength) {
        best = item
        bestLength = prefix.length
      }
    }
  }

  return best
}

/**
 * Roles allowed on `pathname`, or null when no nav entry claims it. Callers
 * must treat null as deny: a route added to the router but never registered
 * here should be unreachable rather than silently unguarded.
 */
export function rolesForPath(pathname: string): ProfileRole[] | null {
  return navItemForPath(pathname)?.roles ?? null
}

/**
 * First page in sidebar order that this role may actually see — admins land on
 * Employees, approvers and employees on Leaves. Falls back to Leaves, the one
 * page every role can read, if a role somehow has no entries at all.
 */
export function getLandingPath(role: ProfileRole): string {
  return NAV_ITEMS.find((item) => item.roles.includes(role))?.path ?? '/containers'
}
