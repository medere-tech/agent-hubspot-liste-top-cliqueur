'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

interface SidebarProps {
  userEmail: string | null | undefined
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()

  const displayName = userEmail
    ? userEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Utilisateur'

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[#e5e5e5] flex flex-col z-20">

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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-sm transition-colors ${
                isActive
                  ? 'bg-[#f5f5f5] text-[#0a0a0a] font-medium'
                  : 'text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 pt-3 border-t border-[#e5e5e5]">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="7" cy="5" r="2.5" stroke="#a3a3a3" strokeWidth="1.2" />
            <path d="M1.5 12.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-[#737373] truncate">{displayName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
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
  )
}
