import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        // El bug que este helper arregla solo se manifiesta en timezones al oeste de
        // Greenwich. Fijarla acá hace que el test falle en CI si alguien vuelve a
        // introducir toISOString() para fechas locales.
        env: { TZ: 'America/Argentina/Buenos_Aires' },
    },
})
