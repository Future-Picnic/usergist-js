require 'json'
package = JSON.parse(File.read(File.join(__dir__, '../package.json')))
Pod::Spec.new do |s|
  s.name = 'UserGistFeedbackExpo'
  s.version = package['version']
  s.summary = 'Expo lifecycle integration for UserGist'
  s.homepage = package['homepage']
  s.license = { :type => 'MIT', :file => '../LICENSE' }
  s.authors = { 'UserGist' => 'engineering@usergist.com' }
  s.source = { :git => 'https://github.com/Future-Picnic/usergist-js.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.0'
  s.static_framework = true
  s.source_files = '*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'UserGistFeedback', package['version']
end
