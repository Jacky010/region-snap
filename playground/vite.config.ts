import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'

const pkg = (path: string) => fileURLToPath(new URL(`../packages/${path}`, import.meta.url))

export default defineConfig({
  plugins: [vue(), react()],
  resolve: {
    alias: {
      '@region-snap/core': pkg('core/src/index.ts'),
      '@region-snap/vue': pkg('vue/src/index.ts'),
      '@region-snap/react': pkg('react/src/index.tsx'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        vue: fileURLToPath(new URL('./vue.html', import.meta.url)),
        react: fileURLToPath(new URL('./react.html', import.meta.url)),
        screen: fileURLToPath(new URL('./screen.html', import.meta.url)),
      },
    },
  },
})
