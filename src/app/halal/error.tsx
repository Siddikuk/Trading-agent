'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function HalalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Halal page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="w-14 h-14 bg-red-900/30 rounded-full flex items-center justify-center text-2xl">⚠</div>
      <div>
        <p className="text-lg font-semibold text-zinc-200">Something went wrong</p>
        <p className="text-sm text-zinc-500 mt-1 max-w-xs">{error.message || 'An unexpected error occurred'}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Try again
        </button>
        <Link href="/halal/settings" className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
          Settings
        </Link>
      </div>
    </div>
  )
}
