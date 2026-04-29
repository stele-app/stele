/**
 * Prebuild vendor dependencies as UMD bundles for the sandbox iframe.
 *
 * Each bundle assigns its exports to a known global (e.g., window.React).
 * These are inlined into the sandbox srcdoc as <script> tags so the
 * opaque-origin iframe doesn't need to fetch anything from the host.
 *
 * Usage: pnpm prebuild:vendor
 */

import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_SRC = join(ROOT, 'vendor-src', 'node_modules');
// Vendor UMDs are consumed by both desktop and web-viewer at runtime.
// Write to every app's public/vendor/ so each Vite dev server can serve them.
const VENDOR_OUTS = [
  join(ROOT, 'public', 'vendor'),
  join(ROOT, 'packages', 'web-viewer', 'public', 'vendor'),
];
// esbuild.wasm sits at each app's public root, served at /esbuild.wasm and
// loaded by the sandbox transform. Copy from the workspace's installed
// esbuild-wasm package.
const WASM_SRC = join(ROOT, 'node_modules', 'esbuild-wasm', 'esbuild.wasm');
const WASM_OUTS = [
  join(ROOT, 'public', 'esbuild.wasm'),
  join(ROOT, 'packages', 'web-viewer', 'public', 'esbuild.wasm'),
];

// Maps package name → { global, entry? (override), externals }
interface VendorSpec {
  global: string;
  entry?: string;           // Override entry point (default: package name)
  externals?: Record<string, string>;  // pkg → global
}

const VENDORS: Record<string, VendorSpec> = {
  'react':              { global: 'React' },
  'react-dom':          { global: 'ReactDOM', externals: { react: 'React' } },
  'lucide-react':       { global: 'lucideReact', externals: { react: 'React' } },
  'recharts':           { global: 'Recharts', externals: { react: 'React', 'react-dom': 'ReactDOM' } },
  'three':              { global: 'THREE' },
  'mathjs':             { global: 'mathjs', entry: 'mathjs/lib/browser/math.js' },
  'd3':                 { global: 'd3' },
  'chart.js':           { global: 'Chart', entry: 'chart.js/auto' },
  'papaparse':          { global: 'Papa' },
  'lodash':             { global: '_' },
  'mammoth':            { global: 'mammoth', entry: 'mammoth/mammoth.browser.js' },
};

// Packages that should be treated as external (shared instance)
const GLOBAL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(VENDORS).map(([pkg, spec]) => [pkg, spec.global])
);

async function buildUmd(pkg: string, spec: VendorSpec): Promise<string> {
  const externals = spec.externals || {};
  const externalPkgs = Object.keys(externals);
  const entryPoint = spec.entry || pkg;

  const plugins = externalPkgs.length > 0 ? [{
    name: 'global-externals',
    setup(b: any) {
      for (const ext of externalPkgs) {
        b.onResolve({ filter: new RegExp(`^${ext}(/.*)?$`) }, (args: any) => ({
          path: args.path,
          namespace: 'global-external',
        }));
        b.onLoad({ filter: /.*/, namespace: 'global-external' }, (args: any) => {
          const base = args.path.split('/')[0];
          const globalVar = GLOBAL_MAP[base] || externals[base];
          return {
            contents: `module.exports = window.${globalVar};`,
            loader: 'js' as const,
          };
        });
      }
    },
  }] : [];

  const result = await build({
    entryPoints: [join(VENDOR_SRC, entryPoint)],
    bundle: true,
    format: 'iife',
    globalName: `__vendor_${spec.global}`,
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins,
  });

  const code = result.outputFiles[0].text;
  return `(function(){${code};window.${spec.global}=__vendor_${spec.global};})();\n`;
}

function buildJsxRuntimeShim(): string {
  return `(function(){
  var React = window.React;
  window._jsx_runtime = {
    jsx: function(type, props, key) {
      return React.createElement(type, key !== undefined ? Object.assign({}, props, {key: key}) : props);
    },
    jsxs: function(type, props, key) {
      return React.createElement(type, key !== undefined ? Object.assign({}, props, {key: key}) : props);
    },
    Fragment: React.Fragment,
  };
})();\n`;
}

// Special handling for packages with pre-built browser UMD/min files
async function copyPrebuilt(pkg: string, spec: VendorSpec, sourceFile: string): Promise<string> {
  const code = readFileSync(join(VENDOR_SRC, sourceFile), 'utf-8');
  return `(function(){${code}})();\n`;
}

function writeVendorFile(filename: string, code: string) {
  for (const out of VENDOR_OUTS) {
    writeFileSync(join(out, filename), code);
  }
}

// Main
console.log('Building vendor UMD bundles...');
for (const out of VENDOR_OUTS) mkdirSync(out, { recursive: true });

// Build in dependency order (React first, then things that depend on it)
const buildOrder = [
  'react', 'react-dom', 'lucide-react', 'recharts',
  'three', 'mathjs', 'd3', 'chart.js',
  'papaparse', 'lodash', 'mammoth',
];

// Packages that have pre-built UMD and are better copied than bundled
const PREBUILT: Record<string, string> = {
  'plotly.js-dist-min': 'plotly.js-dist-min/plotly.min.js',
  'xlsx': 'xlsx/dist/xlsx.mini.min.js',
  'tone': 'tone/build/Tone.js',
  'pdf-lib': 'pdf-lib/dist/pdf-lib.min.js',
};

// Packages that need custom assembly — read multiple files and stitch them.
// Used for pdfjs-dist, which ships pdf.min.js + pdf.worker.min.js separately
// and we need to inline both so the artifact gets a worker without any
// external fetch.
const CUSTOM: Record<string, { global: string; build: () => string }> = {
  'pdfjs-dist': {
    global: 'pdfjsLib',
    build: () => {
      const main = readFileSync(
        join(VENDOR_SRC, 'pdfjs-dist/build/pdf.min.js'),
        'utf-8'
      );
      const worker = readFileSync(
        join(VENDOR_SRC, 'pdfjs-dist/build/pdf.worker.min.js'),
        'utf-8'
      );
      // pdf.min.js is a UMD that ends up assigning to window.pdfjsLib
      // (via globalThis['pdfjs-dist/build/pdf']). After it loads, build
      // an in-memory blob URL for the worker so getDocument() can spawn
      // it without ever fetching from the network. CSP allows blob:
      // workers via worker-src 'self' blob:.
      return `(function(){
${main}
try {
  var __pdfjsWorkerSrc = ${JSON.stringify(worker)};
  var __pdfjsWorkerBlob = new Blob([__pdfjsWorkerSrc], { type: 'application/javascript' });
  var __pdfjs = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (__pdfjs) {
    window.pdfjsLib = __pdfjs;
    __pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(__pdfjsWorkerBlob);
  }
} catch (e) { console.warn('[pdfjs] worker setup failed', e); }
})();
`;
    },
  },
};

async function main() {
  for (const pkg of buildOrder) {
    const spec = VENDORS[pkg];
    console.log(`  ${pkg} → window.${spec.global}`);
    try {
      const code = await buildUmd(pkg, spec);
      const filename = pkg.replace(/[/.]/g, '-') + '.umd.js';
      writeVendorFile(filename, code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to build ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Copy pre-built bundles
  const PREBUILT_GLOBALS: Record<string, string> = {
    'plotly.js-dist-min': 'Plotly',
    'xlsx': 'XLSX',
    'tone': 'Tone',
    'pdf-lib': 'PDFLib',
  };
  for (const [pkg, sourceFile] of Object.entries(PREBUILT)) {
    const spec: VendorSpec = { global: PREBUILT_GLOBALS[pkg] };
    console.log(`  ${pkg} → window.${spec.global} (prebuilt)`);
    try {
      const code = await copyPrebuilt(pkg, spec, sourceFile);
      const filename = pkg.replace(/[/.]/g, '-') + '.umd.js';
      writeVendorFile(filename, code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to copy ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Custom assembly (pdfjs-dist needs main + worker stitched)
  for (const [pkg, { global, build }] of Object.entries(CUSTOM)) {
    console.log(`  ${pkg} → window.${global} (custom)`);
    try {
      const code = build();
      const filename = pkg.replace(/[/.]/g, '-') + '.umd.js';
      writeVendorFile(filename, code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to assemble ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Write jsx-runtime shim
  const jsxShim = buildJsxRuntimeShim();
  writeVendorFile('react-jsx-runtime.umd.js', jsxShim);
  console.log(`  jsx-runtime shim → window._jsx_runtime`);
  console.log(`    ✓ react-jsx-runtime.umd.js (${(jsxShim.length / 1024).toFixed(1)}KB)`);

  // Copy esbuild.wasm to each app's public/.
  console.log('\nCopying esbuild.wasm…');
  for (const out of WASM_OUTS) {
    copyFileSync(WASM_SRC, out);
    console.log(`    ✓ ${out}`);
  }

  console.log(`\nDone. Vendor bundles + wasm written to ${VENDOR_OUTS.length} apps.`);
}

main();
