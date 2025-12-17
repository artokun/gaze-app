import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SocketProvider } from '@/hooks/use-socket'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gaze Tracker',
  description: 'Gaze tracking face animation app with PixiJS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@v1.0.5/gaze-tracker.js"
          defer
        />
      </head>
      <body className={inter.className}>
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  )
}
