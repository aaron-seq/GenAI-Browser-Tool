export default {
  root: 'web',
  base: '/',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'terser',
    target: 'es2022'
  },
  server: {
    port: 3000,
    open: true
  }
};