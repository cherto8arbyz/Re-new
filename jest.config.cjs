module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/tests/daily-look-*.test.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/backend/',
  ],
};
