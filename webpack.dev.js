/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line no-undef
const path = require('path');


module.exports = {
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    historyApiFallback: true,
    static: {
      // eslint-disable-next-line no-undef
      directory: path.join(__dirname, 'public/'),
    },
    compress: true,
    port: 4040,
    proxy: {
      '/api': {
        secure: false,
        changeOrigin: true,
        target: 'http://backend.grbpwr.com:8081',
        // // eslint-disable-next-line no-undef
        // router: () => process.env.REACT_APP_API_BASE_URL || 'http://localhost:3999',
      },
    },
  },
};
