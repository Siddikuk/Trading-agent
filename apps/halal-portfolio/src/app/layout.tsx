import type { Metadata } from 'next'
import './globals.css'
import Shell from './shell'

export const metadata: Metadata = {
  title: 'Halal Portfolio',
  description: 'AAOIFI-screened halal stocks with weekly DCA recommendations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
