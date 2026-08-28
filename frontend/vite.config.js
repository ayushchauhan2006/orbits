import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  assetsInclude: ['**/*.glb'],

  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesiumStatic/'),
  },
})