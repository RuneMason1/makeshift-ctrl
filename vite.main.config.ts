import { rmSync } from 'fs'
import { defineConfig } from 'vite';

const mainDir = '.vite/build/'

rmSync(mainDir, { recursive: true, force: true })

export default defineConfig({
  build: {
    minify: false,
    outDir: mainDir,
    target: 'node22',
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
      },
      external: [
        '@eos-makeshift/serial',
        '@nut-tree-fork/nut-js',
        'uuid',
        'nanoid',
        /^blockly(?:\/|$)/,
        'original-fs',
        'stylelint',
      ],
    }
  },
  publicDir: false,
})
