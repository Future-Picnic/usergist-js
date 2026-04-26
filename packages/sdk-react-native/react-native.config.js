// React Native autolinking entry. RN 0.60+ reads this to discover the
// native iOS Pod and Android Gradle module without consumer-side edits.
module.exports = {
  dependency: {
    platforms: {
      ios: {
        // The podspec at repo root pulls ios/ sources via s.source_files.
      },
      android: {
        sourceDir: 'android',
        packageImportPath: 'import studio.ritmus.feedback.RitmusPushPackage;',
        packageInstance: 'new RitmusPushPackage()',
      },
    },
  },
}
