import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', preview: 'src/preview.ts' },
    format: ['esm', 'cjs'],
    // Resolve core declarations as build inputs so consumers need only Web.
    dts: {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@usergist/sdk-core/client': ['../sdk-core/dist/client.d.ts'] },
      },
    },
    sourcemap: true,
    target: 'es2022',
    clean: false,
    splitting: false,
    noExternal: [/^@usergist\/sdk-core(?:\/|$)/],
    external: ['react', 'react/jsx-runtime', '@usergist/feedback-web'],
  },
  {
    entry: { usergist: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'UserGistWeb',
    target: 'es2022',
    noExternal: ['@usergist/sdk-core'],
    minify: true,
    clean: false,
  },
])
