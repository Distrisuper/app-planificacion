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
        // .worktrees/ son copias sueltas de tareas en paralelo (ver skill de git
        // worktrees) con su propio node_modules: si vitest las recorre, carga una
        // segunda copia de React y los hooks explotan con "Cannot read properties
        // of null" en cualquier componente de la copia principal.
        exclude: ['**/node_modules/**', '**/.worktrees/**', '**/e2e/**'],
        // El bug que este helper arregla solo se manifiesta en timezones al oeste de
        // Greenwich. Fijarla acá hace que el test falle en CI si alguien vuelve a
        // introducir toISOString() para fechas locales.
        env: {
            TZ: 'America/Argentina/Buenos_Aires',
            // Los tests de src/api/analitica.test.ts ejercitan la capa de fixture a
            // propósito. Sin fijarlo acá quedaban a merced del .env de cada máquina:
            // apagar el mock para probar contra el backend local los hacía salir a la
            // red y fallar con "Network Error", que no dice nada de lo que se rompió.
            VITE_ANALITICA_MOCK: '1',
        },
    },
})
