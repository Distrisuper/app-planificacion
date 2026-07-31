/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                dsnavy: '#213D82',
                dsnavytext: '#182645',
                dsgreen: '#009E4F',
                dsred: '#B42318',
                // El naranja de "visita en curso": la barra flotante, el badge y el botón
                // de cerrar visita. Naranja y no dsred a propósito — cerrar la visita es
                // completar el trabajo, no destruir nada; rojo acá leería como peligro.
                dsorange: '#B45309',
                dsmuted: '#697585',
                dsline: '#E7E9F0',
            },
        },
    },
    plugins: [],
}
