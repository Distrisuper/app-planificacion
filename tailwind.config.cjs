/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            // Los celulares de 320-359px de ancho (iPhone SE 1st gen, Android chicos que
            // todavia hay en la calle) son los unicos donde la tabla de rubros no cierra:
            // ahi se esconde la columna M.ANT para devolverle esos 54px al nombre del
            // rubro. Tailwind no trae nada abajo de sm (640px).
            screens: { xs: '360px' },
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
                // Tokens semánticos (variables en src/index.css). Lo nuevo usa estos, no los ds*.
                superficie: 'rgb(var(--superficie) / <alpha-value>)',
                tarjeta: 'rgb(var(--tarjeta) / <alpha-value>)',
                tinta: {
                    DEFAULT: 'rgb(var(--tinta) / <alpha-value>)',
                    2: 'rgb(var(--tinta-2) / <alpha-value>)',
                },
                linea: 'rgb(var(--linea) / <alpha-value>)',
                primario: 'rgb(var(--primario) / <alpha-value>)',
                estado: {
                    ok: { fondo: 'rgb(var(--estado-ok-fondo) / <alpha-value>)', texto: 'rgb(var(--estado-ok-texto) / <alpha-value>)' },
                    atencion: { fondo: 'rgb(var(--estado-atencion-fondo) / <alpha-value>)', texto: 'rgb(var(--estado-atencion-texto) / <alpha-value>)' },
                    mal: { fondo: 'rgb(var(--estado-mal-fondo) / <alpha-value>)', texto: 'rgb(var(--estado-mal-texto) / <alpha-value>)' },
                    neutro: { fondo: 'rgb(var(--estado-neutro-fondo) / <alpha-value>)', texto: 'rgb(var(--estado-neutro-texto) / <alpha-value>)' },
                },
            },
        },
    },
    plugins: [],
}
