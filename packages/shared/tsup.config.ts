import { defineConfig } from 'tsup';

export default defineConfig({
  /**
   * Four entries rather than one (Phase 11).
   *
   * With a single entry tsup inlines the whole package into `dist/index.js`,
   * and every Zod schema in it is a `z.object({...})` call evaluated at module
   * scope. A consumer that imports one constant from the barrel therefore drags
   * Zod into its bundle - which put 21KB gzipped of validation code on the
   * storefront shell for the sake of `NEPAL_DISTRICTS` and one timeout value.
   *
   * Splitting the entries makes the barrel a set of re-exports across separate
   * chunk files, so a bundler can drop the ones nothing reached. Consumers keep
   * importing from `@bazaar/shared`; the subpaths in `exports` exist for the
   * cases where being explicit is clearer than trusting tree-shaking.
   */
  entry: [
    'src/index.ts',
    'src/constants.ts',
    'src/enums.ts',
    'src/schemas/index.ts',
    'src/types/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Shared code between entries goes to its own chunk instead of being copied
  // into each one. ESM only; CJS cannot express it.
  splitting: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
