import { defineConfig } from 'tsup'
export default defineConfig([
  { entry: { index: 'src/index.ts', preview: 'src/preview.ts' }, format: ['esm', 'cjs'], dts: true,
    sourcemap: true, target: 'es2022', clean: false, splitting: false, external: ['react', 'react/jsx-runtime', '@usergist/feedback-web'] },
  { entry: { usergist: 'src/browser.ts' }, format: ['iife'], globalName: 'UserGistWeb', target: 'es2022',
    noExternal: ['@usergist/sdk-core'], minify: true, clean: false },
])
