'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    label: 'Thématiques',
    href: '/dashboard/thematiques',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1" y="9" width="3" height="6" rx="0.75" stroke="currentColor" strokeWidth="1.3" />
        <rect x="6" y="5" width="3" height="10" rx="0.75" stroke="currentColor" strokeWidth="1.3" />
        <rect x="11" y="1" width="3" height="14" rx="0.75" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    label: 'Top cliqueurs',
    href: '/dashboard/top-cliqueurs',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2 5.2l4-.6L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Listes HubSpot',
    href: '/dashboard/listes',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 4h9M5 8h9M5 12h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="2" cy="4" r="1" fill="currentColor" />
        <circle cx="2" cy="8" r="1" fill="currentColor" />
        <circle cx="2" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Export',
    href: '/dashboard/export',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M8 1v8M5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
]

const ADMIN_ITEMS: NavItem[] = [
  {
    label: 'Utilisateurs',
    href: '/dashboard/admin/users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 13c0-2.485 2.015-4 4.5-4s4.5 1.515 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="11.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10.5 9c2 0 4 1 4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
]

interface SidebarProps {
  userEmail: string | null | undefined
  userName?: string | null
  userRole?: 'admin' | 'user' | null
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(href)
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-sm transition-colors ${
        active
          ? 'bg-[#f5f5f5] text-[#0a0a0a] font-medium'
          : 'text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}

export default function Sidebar({ userEmail, userName, userRole }: SidebarProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = () => setSidebarOpen(false)

  // Préfère le full_name explicite. Fallback : dérivé de l'email.
  const displayName =
    (userName && userName.trim()) ||
    (userEmail
      ? userEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Utilisateur')

  const isProfileActive = pathname.startsWith('/dashboard/profile')

  return (
    <>
      {/* Burger — mobile only */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Ouvrir le menu"
        className="lg:hidden fixed top-3 left-3 z-30 flex items-center justify-center w-9 h-9 bg-white border border-[#e5e5e5] rounded-[4px] text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Backdrop — mobile only, visible quand sidebar ouverte */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          aria-hidden="true"
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[#e5e5e5] flex flex-col z-40 transition-transform duration-200 lg:translate-x-0 lg:z-20 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-[#e5e5e5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-medere-black.png"
          alt="Médéré"
          style={{ maxWidth: '100px', height: 'auto' }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isItemActive(pathname, item.href)} onClick={closeSidebar} />
        ))}

        {/* Section Administration — visible uniquement pour les admins */}
        {userRole === 'admin' && (
          <>
            <div className="pt-5 pb-1.5 px-3">
              <span className="text-[10px] font-medium text-[#a3a3a3] tracking-wider uppercase">
                Administration
              </span>
            </div>
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} active={isItemActive(pathname, item.href)} onClick={closeSidebar} />
            ))}
          </>
        )}
      </nav>

      {/* User pill (cliquable → /dashboard/profile) + Se déconnecter */}
      <div className="px-3 pb-4 pt-3 border-t border-[#e5e5e5] space-y-0.5">
        <Link
          href="/dashboard/profile"
          onClick={closeSidebar}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] transition-colors ${
            isProfileActive
              ? 'bg-[#f5f5f5]'
              : 'hover:bg-[#f5f5f5]'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="7" cy="5" r="2.5" stroke={isProfileActive ? '#0a0a0a' : '#a3a3a3'} strokeWidth="1.2" />
            <path d="M1.5 12.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5" stroke={isProfileActive ? '#0a0a0a' : '#a3a3a3'} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className={`text-xs truncate ${isProfileActive ? 'text-[#0a0a0a] font-medium' : 'text-[#0a0a0a]'}`}>
              {displayName}
            </div>
            {userEmail && (
              <div className="text-[10px] text-[#a3a3a3] truncate">{userEmail}</div>
            )}
          </div>
        </Link>

        <button
          onClick={() => { closeSidebar(); signOut({ callbackUrl: '/login' }) }}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[4px] text-sm text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Se déconnecter
        </button>
      </div>

      </aside>
    </>
  )
}
