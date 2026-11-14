module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  // Shipping browser APIs that eslint's `browser` env does not list yet.
  // Declared rather than disabled so a genuine typo is still caught.
  globals: { BarcodeDetector: 'readonly' },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
}
