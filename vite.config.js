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
  
  // Load environment variables from project root
  envDir: '..',
  
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
    // Increase chunk size warning limit for MediaPipe (large files)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'frontend/index.html'),
        login: path.resolve(__dirname, 'frontend/login.html'),
        dashboard: path.resolve(__dirname, 'frontend/dashboard.html'),
        settings: path.resolve(__dirname, 'frontend/settings.html'),
      },
      // Don't bundle MediaPipe - let it load from CDN in production
      external: (id) => {
        // Externalize MediaPipe packages - they need to load from CDN
        // This prevents bundling issues and allows CDN fallback
        return false; // We'll handle MediaPipe via CDN in the code
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

