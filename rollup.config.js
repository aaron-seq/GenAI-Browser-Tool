import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import json from '@rollup/plugin-json';

const isProduction = process.env.NODE_ENV === 'production';

const plugins = [
  resolve({
    browser: true,
    preferBuiltins: false
  }),
  commonjs(),
  json()
];

if (isProduction) {
  plugins.push(terser({
    compress: {
      drop_console: true,
      drop_debugger: true
    }
  }));
}

export default [
  {
    input: 'src/popup/popup-manager.js',
    output: {
      file: 'dist/popup.js',
      format: 'iife',
      sourcemap: !isProduction
    },
    plugins
  },
  {
    input: 'src/background/background-service.js',
    output: {
      file: 'dist/background.js',
      format: 'es',
      sourcemap: !isProduction
    },
    plugins
  },
  {
    input: 'src/content/content-manager.js',
    output: {
      file: 'dist/content.js',
      format: 'iife',
      sourcemap: !isProduction
    },
    plugins
  }
];