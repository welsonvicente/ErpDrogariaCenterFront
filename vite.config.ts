/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Identifica essa build de forma única (embutido no bundle via `define` e
// também gravado em dist/version.json sem hash no nome). O UpdateBanner
// compara os dois em runtime pra saber se saiu um deploy novo enquanto a
// aba estava aberta — ver src/components/UpdateBanner.tsx.
const buildId = String(Date.now())

function writeVersionFile() {
  return {
    name: 'write-version-file',
    apply: 'build' as const,
    closeBundle() {
      writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ buildId }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), writeVersionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    // Expõe o dev server na rede local (não só localhost), para acessar de
    // outros dispositivos (celular, tablet no balcão) pelo IP da máquina.
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setupTests.ts'],
  },
})
