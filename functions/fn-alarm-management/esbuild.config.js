import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to resolve @lib/* path aliases
const libAliasPlugin = {
  name: 'lib-alias',
  setup(build) {
    // Resolve @lib/* imports to the lib source directory
    build.onResolve({ filter: /^@lib\// }, (args) => {
      const libPath = args.path.replace(/^@lib\//, '');
      // Remove .js extension if present (TypeScript source doesn't have it)
      const cleanPath = libPath.replace(/\.js$/, '');
      return {
        path: resolve(__dirname, '../../lib', cleanPath + '.ts'),
      };
    });
  },
};

async function build() {
  try {
    await esbuild.build({
      entryPoints: [resolve(__dirname, 'src/main.ts')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outfile: resolve(__dirname, 'dist/main.js'),
      sourcemap: true,
      // External dependencies that should NOT be bundled
      external: [
        'node-appwrite',
        'zod',
      ],
      plugins: [libAliasPlugin],
      // Handle .ts extensions
      resolveExtensions: ['.ts', '.js'],
      // Preserve directory structure for cleaner output
      treeShaking: true,
      minify: false, // Keep readable for debugging
      // Banner to indicate this is a bundled file
      banner: {
        js: '// Bundled with esbuild - @lib imports are resolved inline',
      },
    });
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
