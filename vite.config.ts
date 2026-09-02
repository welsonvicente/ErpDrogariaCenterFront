import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Expõe o dev server na rede local (não só localhost), para acessar de
    // outros dispositivos (celular, tablet no balcão) pelo IP da máquina.
    host: true,
  },
})
