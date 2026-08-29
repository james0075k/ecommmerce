import base from './base.mjs';

/**
 * Next.js apps additionally load `next/core-web-vitals` through their own
 * eslint.config.mjs (via FlatCompat) - this file supplies the shared rules.
 */
export default [
  ...base,
  {
    files: ['**/*.tsx'],
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },
];
