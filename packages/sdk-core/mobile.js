// Compatibility entry for React Native Metro versions/configurations that do
// not resolve package.json `exports`. Standards-aware resolvers continue to
// use the `./mobile` export above; legacy Metro resolves this physical file.
export * from './dist/mobile.js'
