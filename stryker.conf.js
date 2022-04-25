/**
 * @type {import('@stryker-mutator/api/core').StrykerOptions}
 */
module.exports = {
  packageManager: 'npm',
  testRunner: 'jest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',

  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  mutate: ['src/files/**/*.ts', 'src/Utils.ts', 'src/Constants.ts', 'src/FileSearch.ts', 'src/FileTypeUtils.ts']  // FIXME: This is a temporary workaround
};
