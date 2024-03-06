const path = require('path');
require('dotenv').config();

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    historyApiFallback: true,
    static: {
      directory: path.join(__dirname, 'public/'),
    },
    compress: true,
    port: 4040,
    proxy: [
      {
        context: ['/api'],
        secure: false,
        changeOrigin: true,
        target: process.env.REACT_APP_SERVER_URL,
        router: () => process.env.REACT_APP_API_BASE_URL || 'http://localhost:3999',
      }
    ],
  },
};
