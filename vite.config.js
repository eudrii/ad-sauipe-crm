import { defineConfig } from 'vite'

export default defineConfig({
  base: './',   // necessário para GitHub Pages funcionar em subdiretório
  server: {
    port: 6759
  }
})
