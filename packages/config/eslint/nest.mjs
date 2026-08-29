import base from './base.mjs';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // Nest relies on decorators + emitDecoratorMetadata for DI.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // MUST stay off. `import type { PrismaService }` erases the class at
      // runtime, so emitDecoratorMetadata records `Object` instead of the token
      // and Nest throws UnknownDependenciesException at boot - and the build
      // still passes, so it fails only when the app starts.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
