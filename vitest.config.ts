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
        // Vitest por defecto levanta un worker por core menos uno (acá 15), cada uno con
        // su jsdom. En una máquina de desarrollo eso compite con el `npm run dev` y los
        // servidores MCP que ya están corriendo: los tests no se rompen, se ponen tan
        // lentos que pegan contra el testTimeout, y falla un puñado distinto en cada
        // corrida. Con la mitad de los cores la suite tarda parecido y da el mismo
        // resultado siempre. Porcentaje y no un número fijo, para que escale en CI.
        maxWorkers: '50%',
        // Los 5000ms que trae vitest de fábrica son para tests unitarios; acá cada test
        // monta React + jsdom + React Query, y sumados dan ~170s de trabajo repartidos
        // entre workers. Con la máquina ocupada, un test que aislado corre en 200ms
        // tarda segundos de reloj, y lo que fallaba era el presupuesto, no el código
        // (mismo test, aislado, pasa siempre). El orden importa: esta ventana es MÁS
        // grande que el asyncUtilTimeout de src/test/setup.ts, así que un elemento que
        // nunca aparece lo reporta el findBy con su mensaje útil ("Unable to find…") y
        // no este timeout, que no dice qué se estaba esperando.
        testTimeout: 15000,
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
