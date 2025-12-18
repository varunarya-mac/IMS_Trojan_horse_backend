import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to resolve @lib/* path aliases
const libAliasPlugin = {
  name: 'lib-alias',
  setup(build) {
    build.onResolve({ filter: /^@lib\// }, (args) => {
      const libPath = args.path.replace(/^@lib\//, '');
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
      external: [
        'node-appwrite',
        'zod',
        'csv-parse',
      ],
      plugins: [libAliasPlugin],
      resolveExtensions: ['.ts', '.js'],
      treeShaking: true,
      minify: false,
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
