/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                dsnavy: '#182645',
                dsgreen: '#16a34a',
                dsred: '#B42318',
                dsmuted: '#697585',
            },
        },
    },
    plugins: [],
}
