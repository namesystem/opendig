const config = require('../../configs/webpack.config');
const path = require('path');

module.exports = {
  ...config,
  output: {
    library: {
      name: 'StacksEncryption',
      type: 'umd2',
    },
    filename: 'index.umd.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
    },
  },
};
