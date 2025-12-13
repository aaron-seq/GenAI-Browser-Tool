import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

const isProduction = process.env.NODE_ENV === 'production';

const baseConfig = {
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: !isProduction,
      inlineSources: !isProduction
    }),
    ...(isProduction ? [terser({
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      format: {
        comments: false
      }
    })] : [])
  ],
  external: ['chrome'],
  onwarn: (warning, warn) => {
    // Suppress certain warnings
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    if (warning.code === 'MISSING_GLOBAL_NAME') return;
    warn(warning);
  }
};

export default [
  // Background script
  {
    ...baseConfig,
    input: 'background.js',
    output: {
      file: 'dist/background.js',
      format: 'iife',
      name: 'BackgroundService',
      sourcemap: !isProduction
    }
  },
  // Content script
  {
    ...baseConfig,
    input: 'content.js',
    output: {
      file: 'dist/content.js',
      format: 'iife',
      name: 'ContentScript',
      sourcemap: !isProduction
    }
  },
  // Popup script
  {
    ...baseConfig,
    input: 'scripts/popup-main.js',
    output: {
      file: 'dist/popup.js',
      format: 'iife',
      name: 'PopupInterface',
      sourcemap: !isProduction
    }
  },
  // Options script
  {
    ...baseConfig,
    input: 'options.js',
    output: {
      file: 'dist/options.js',
      format: 'iife',
      name: 'OptionsInterface',
      sourcemap: !isProduction
    }
  },
  // Offscreen script
  {
    ...baseConfig,
    input: 'offscreen.js',
    output: {
      file: 'dist/offscreen.js',
      format: 'iife',
      name: 'OffscreenWorker',
      sourcemap: !isProduction
    }
  }
];