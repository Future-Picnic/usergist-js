import { defineConfig } from 'tsup'

// Build after the main entry so the public self-import has declarations.
// Keeping that import external makes React share the exported SDK singleton.
export default defineConfig({
  entry: { react: 'src/react.tsx' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: false,
  splitting: false,
  external: ['react', 'react/jsx-runtime', '@usergist/feedback-web'],
})
