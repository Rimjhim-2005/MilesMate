export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12060a',      // app background
        sage: '#b1d29b',     // nav, primary card
        clay: '#8c5148',     // distance card
        moss: '#2f3b29',     // deliveries card
        plum: '#2b1a2d',     // chart card
        slate: '#6d706b',    // summary card
        fog: '#d9d9d9',      // forum cards
        mist: '#c3c9bd',     // search bar
        wine: '#5a3731',     // active tab pill
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
