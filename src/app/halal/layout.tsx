'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PieChart, History, ListFilter, Settings, Shield } from 'lucide-react'

const NAV = [
  { href: '/halal', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/halal/portfolio', label: 'My Portfolio', icon: PieChart },
  { href: '/halal/history', label: 'History', icon: History },
  { href: '/halal/stocks', label: 'Halal Stocks', icon: ListFilter },
  { href: '/halal/settings', label: 'Settings', icon: Settings },
]

export default function HalalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#0a0f0a] text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-green-900/40 px-4 py-3 flex items-center gap-3 bg-[#0c130c]">
        <Shield className="text-green-400" size={22} />
        <span className="font-bold text-green-300 text-lg tracking-tight">Halal Portfolio</span>
        <span className="text-xs bg-green-900/40 text-green-400 border border-green-700/30 px-2 py-0.5 rounded-full">
          AAOIFI Standard
        </span>
        <div className="flex-1" />
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Trading Agent
        </Link>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <nav className="w-48 border-r border-green-900/30 bg-[#0c130c] p-3 flex flex-col gap-1 shrink-0 hidden sm:flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? 'bg-green-900/50 text-green-300 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Mobile bottom nav */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t border-green-900/40 bg-[#0c130c] flex z-50">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                  active ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon size={18} />
                {label.split(' ')[0]}
              </Link>
            )
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 pb-20 sm:pb-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
