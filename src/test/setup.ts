import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// El default de testing-library para findBy*/waitFor es 1000ms, pero el testTimeout de
// vitest es 5000ms: un test tenía 5s de presupuesto y sus esperas se rendían al segundo.
// Bajo carga (dev server de vite corriendo al lado, varios workers de jsdom en paralelo)
// el primer render de una página + su query tarda más de 1s, y el test fallaba con
// "Unable to find role=..." — que parece un bug de la UI, no lo que realmente es: una
// espera corta. Alinear las dos ventanas hace que un findBy solo falle cuando el
// elemento de verdad no llega.
configure({ asyncUtilTimeout: 5000 })
