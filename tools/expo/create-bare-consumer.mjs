#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, cpSync, appendFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const archive = resolve(process.argv[2])
const root = mkdtempSync(join(tmpdir(), 'usergist-rn74-consumer-'))
console.log(`Bare React Native consumer retained: ${root}`)
writeFileSync(join(root, 'package.json'), JSON.stringify({
  name: 'usergist-bare-consumer', version: '1.0.0', private: true,
  scripts: { start: 'react-native start --port 28913' },
  dependencies: { react: '18.2.0', 'react-native': '0.74.0', '@usergist/feedback-react-native': archive, '@react-native-async-storage/async-storage': '1.24.0', 'react-native-safe-area-context': '4.10.9' },
  devDependencies: { '@react-native-community/cli': '13.6.4', '@react-native-community/cli-platform-ios': '13.6.4', '@react-native-community/cli-platform-android': '13.6.4', '@react-native/babel-preset': '0.74.81', '@react-native/metro-config': '0.74.81', '@babel/core': '7.29.0' },
}, null, 2))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' })
if (existsSync(join(root, 'node_modules/expo'))) throw new Error('Bare React Native must not install optional Expo dependencies')
const template = join(root, 'node_modules/react-native/template')
cpSync(template, root, { recursive: true, filter: file => file !== join(template, 'package.json') })
writeFileSync(join(root, 'App.tsx'), "import React from 'react';\nimport { Text } from 'react-native';\nimport { UserGistProvider } from '@usergist/feedback-react-native';\nexport default function App() { return <UserGistProvider><Text>UserGist React Native baseline</Text></UserGistProvider>; }\n")
const podfile = join(root, 'ios/Podfile')
writeFileSync(podfile, readFileSync(podfile, 'utf8').replace('    )\n  end\nend', `    )
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
      end
    end
  end
end`))
const delegate = join(root, 'ios/HelloWorld/AppDelegate.mm')
writeFileSync(delegate, readFileSync(delegate, 'utf8').replace('return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];', 'RCTBundleURLProvider *provider = [RCTBundleURLProvider sharedSettings];\n  provider.jsLocation = @"localhost:28913";\n  return [provider jsBundleURLForBundleRoot:@"index"];'))
console.log(`BARE_CONSUMER=${root}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `consumer=${root}\n`)
