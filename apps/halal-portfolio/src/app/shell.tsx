'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PieChart, BookOpen, Settings, Shield } from 'lucide-react'

const NAV = [
  { href: '/',         label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio',   icon: PieChart },
  { href: '/stocks',   label: 'Stocks',       icon: BookOpen },
  { href: '/settings', label: 'Settings',     icon: Settings },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <div className="min-h-screen bg-[#080d08] text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-green-900/40 px-4 py-3 flex items-center gap-3 bg-[#0b110b] sticky top-0 z-40">
        <Shield className="text-green-400 shrink-0" size={20} />
        <span className="font-bold text-green-300 tracking-tight">Halal Portfolio</span>
        <span className="text-[10px] bg-green-900/40 text-green-400 border border-green-700/30 px-2 py-0.5 rounded-full hidden sm:inline">
          AAOIFI · Musaffa verified
        </span>
        <div className="flex-1" />
        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                path === href
                  ? 'bg-green-900/50 text-green-300 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}>
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 px-4 py-5 sm:px-8 sm:py-6 pb-24 sm:pb-8 max-w-3xl mx-auto w-full">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t border-green-900/40 bg-[#0b110b] flex z-40">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
              path === href ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
