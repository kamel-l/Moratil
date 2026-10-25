const fs = require('node:fs');
const path = require('node:path');

const buildGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
  'android',
  'build.gradle',
);
const deprecated = "getDefaultProguardFile('proguard-android.txt')";
const supported = "getDefaultProguardFile('proguard-android-optimize.txt')";

if (!fs.existsSync(buildGradlePath)) {
  throw new Error(`Speech recognition Android build file not found: ${buildGradlePath}`);
}

const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

if (buildGradle.includes(deprecated)) {
  fs.writeFileSync(buildGradlePath, buildGradle.replace(deprecated, supported));
} else if (!buildGradle.includes(supported)) {
  throw new Error(`Expected ProGuard configuration not found in ${buildGradlePath}`);
}
