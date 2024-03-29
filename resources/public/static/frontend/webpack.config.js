const Path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const jassubFiles = [
  'jassub/dist/jassub-worker.js',
  'jassub/dist/jassub-worker.wasm',
  'jassub/dist/default.woff2'
];

module.exports = {
  entry: {
    liveTranscode: './src/LiveTranscode/index.ts'
  },
  devtool: 'source-map',

  output: {
    filename: '[name].js',
    path: Path.resolve(__dirname, 'dist'),
    clean: true,
    pathinfo: false,
    library: {
      name: 'ApolloLib',
      type: 'var'
    }
  },

  module: {
    rules: [
      {
        test: /\.ts(x)?$/,
        loader: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.svg$/,
        use: 'file-loader'
      },
      {
        test: /\.png$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              mimetype: 'image/png'
            }
          }
        ]
      }
    ]
  },

  resolve: {extensions: ['.tsx', '.ts', '.js']},

  plugins: [
    new CopyPlugin({
      patterns: jassubFiles.map(asset => {
        return {
          from: Path.resolve(__dirname, `./node_modules/${asset}`),
          to: Path.resolve(__dirname, './dist/third-party/jassub/')
        };
      })
    }),
    new MiniCssExtractPlugin()
  ],

  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  }
};
