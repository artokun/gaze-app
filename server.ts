/**
 * Custom server with Next.js + Socket.IO integration.
 */

import 'dotenv/config'
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { setupSocketHandlers } from './lib/socket/handlers'
import { initGpuManager, gracefulShutdown } from './lib/gpu/manager'
import { initStorage } from './lib/storage'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  // Initialize Socket.IO
  const io = new SocketIOServer(httpServer, {
    maxHttpBufferSize: 50e6, // 50 MB max for file uploads
    cors: {
      origin: dev ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
      methods: ['GET', 'POST'],
    },
  })

  // Setup Socket.IO handlers
  setupSocketHandlers(io)

  // Initialize storage
  initStorage()

  // Initialize GPU manager (warm pod on startup)
  initGpuManager().catch((error) => {
    console.error('Failed to initialize GPU manager:', error)
  })

  // Graceful shutdown handlers
  const shutdown = () => {
    console.log('\nShutting down gracefully...')
    gracefulShutdown()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Start server
  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> Environment: ${dev ? 'development' : 'production'}`)
  })
})
