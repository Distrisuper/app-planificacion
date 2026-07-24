/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                dsnavy: '#213D82',
                dsnavytext: '#182645',
                dsgreen: '#009E4F',
                dsred: '#B42318',
                dsmuted: '#697585',
                dsline: '#E7E9F0',
            },
        },
    },
    plugins: [],
}
