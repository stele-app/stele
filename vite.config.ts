import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Serve vendor/ UMD bundles as static assets during dev
  publicDir: 'public',
  server: {
    fs: {
      // Allow serving files from vendor/ directory
      allow: ['..'],
    },
  },
  // Treat .jsx fixture files as raw text imports
  assetsInclude: [],
})
