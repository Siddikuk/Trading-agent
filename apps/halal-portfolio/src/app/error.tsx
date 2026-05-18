'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Halal Portfolio error]', error.message, error.stack)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24, background: '#080d08', color: '#e4e4e7' }}>
      <div style={{ fontSize: 32 }}>⚠</div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: '#a1a1aa', maxWidth: 360 }}>{error.message}</p>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={reset}
          style={{ padding: '8px 20px', background: '#166534', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, cursor: 'pointer' }}
        >
          Try again
        </button>
        <a href="/settings"
          style={{ padding: '8px 20px', background: '#27272a', border: 'none', borderRadius: 10, color: '#d4d4d8', fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}
        >
          Settings
        </a>
      </div>
    </div>
  )
}
