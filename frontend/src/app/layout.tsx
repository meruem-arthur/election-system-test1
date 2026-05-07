import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Smart Election System | Departmental Elections',
  description: 'Secure, transparent, anonymous departmental election platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body bg-dark text-white antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#141414',
              color: '#fff',
              border: '1px solid #00ff88',
              fontFamily: 'var(--font-syne)',
            },
            success: { iconTheme: { primary: '#00ff88', secondary: '#000' } },
            error: { iconTheme: { primary: '#ff4444', secondary: '#000' } },
          }}
        />
      </body>
    </html>
  )
}
