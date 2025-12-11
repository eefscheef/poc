/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.[jt]s'],
  transform: {}, // no Babel/ts-jest needed for plain JS
};