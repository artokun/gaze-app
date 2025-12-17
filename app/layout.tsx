import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SocketProvider } from '@/hooks/use-socket'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Gaze Tracker - AI-Powered Interactive Portraits',
    template: '%s | Gaze Tracker',
  },
  description:
    'Transform your photos into mesmerizing AI-animated portraits that follow your every move. Upload a photo and watch it come alive with realistic gaze tracking powered by cutting-edge machine learning.',
  keywords: [
    'gaze tracking',
    'AI portrait generator',
    'animated portrait',
    'face animation',
    'interactive portrait',
    'LivePortrait',
    'machine learning',
    'neural networks',
    'eye tracking',
    'face retargeting',
  ],
  authors: [{ name: 'Art', url: 'https://github.com/artokun' }],
  creator: 'Art',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gaze.art',
    siteName: 'Gaze Tracker',
    title: 'Gaze Tracker - AI-Powered Interactive Portraits',
    description:
      'Transform your photos into mesmerizing AI-animated portraits that follow your every move. Upload a photo and watch it come alive with realistic gaze tracking.',
    images: [
      {
        url: 'https://gaze.art/api/files/demo/input.jpg',
        width: 512,
        height: 640,
        alt: 'Gaze Tracker demo portrait',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gaze Tracker - AI-Powered Interactive Portraits',
    description:
      'Transform your photos into mesmerizing AI-animated portraits that follow your every move. Upload a photo and watch it come alive with realistic gaze tracking.',
    creator: '@artokun',
    images: ['https://gaze.art/api/files/demo/input.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
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
          src="https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@v1.0.6/gaze-tracker.js"
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
