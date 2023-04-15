/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/media/watch/live_transcode/language/ISO639_2ToISO639_1Mapping.ts'
  ]
};
