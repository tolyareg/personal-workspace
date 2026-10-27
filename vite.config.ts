import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Замените 'personal-workspace' на имя вашего репозитория на GitHub:
const REPO_NAME = 'personal-workspace';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Personal Workspace & Planner',
        short_name: 'Workspace',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        start_url: './',
        scope: './'
      }
    })
  ]
}));