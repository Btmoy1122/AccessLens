import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite Configuration for AccessLens
 * 
 * Vite is used for fast development with HMR (Hot Module Replacement)
 * and optimized production builds.
 */
export default defineConfig({
  // Root directory - frontend folder contains our main application
  root: 'frontend',
  
  // Development server configuration
  server: {
    port: 5173,
    host: true, // Allow external connections (useful for mobile testing)
    strictPort: false,
    // HTTPS is required for camera access in production
    // For development, localhost works without HTTPS
    https: false, // Set to true if you need HTTPS locally
  },
  
  // Build configuration
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    // Optimize for production
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'frontend/index.html'),
      },
    },
  },
  
  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend'),
      '@ml': path.resolve(__dirname, 'ml'),
      '@backend': path.resolve(__dirname, 'backend'),
      '@assets': path.resolve(__dirname, 'assets'),
    },
  },
  
  // Public directory for static assets
  publicDir: '../assets',
  
  // Optimize dependencies
  // Note: aframe and ar.js removed since they're not currently used
  // Add them back when AR features are implemented
  optimizeDeps: {
    // include: ['aframe', 'ar.js'], // Commented out - not installed yet
  },
});

