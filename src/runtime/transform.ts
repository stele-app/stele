/**
 * Artifact JSX/TSX transform pipeline.
 *
 * Two-step process:
 * 1. esbuild-wasm compiles JSX/TSX → JavaScript (ESM with import statements)
 * 2. Import rewriter converts `import X from 'react'` → `const X = window.React`
 *
 * The result is a plain script (not a module) that can run inside the sandbox
 * iframe where vendor libs are pre-loaded as globals via <script> tags.
 */

import { initialize, transform as esbuildTransform } from 'esbuild-wasm';

let initPromise: Promise<void> | null = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = initialize({
      wasmURL: './esbuild.wasm',
      worker: true,
    });
  }
  return initPromise;
}

/**
 * Maps bare import specifiers to window global names.
 * Must stay in sync with the vendor UMD bundles in vendor/.
 */
const VENDOR_GLOBALS: Record<string, string> = {
  'react':              'React',
  'react/jsx-runtime':  '_jsx_runtime',
  'react-dom':          'ReactDOM',
  'react-dom/client':   'ReactDOM',
  'lucide-react':       'lucideReact',
  'recharts':           'Recharts',
  'three':              'THREE',
  'mathjs':             'mathjs',
  'd3':                 'd3',
  'plotly':             'Plotly',
  'chart.js':           'Chart',
  'tone':               'Tone',
  'papaparse':          'Papa',
  'xlsx':               'XLSX',
  'mammoth':            'mammoth',
  'lodash':             '_',
};

/**
 * Rewrites ESM import statements to reference window globals.
 *
 * Handles:
 *   import React from 'react'           → const React = window.React;
 *   import { useState } from 'react'    → const { useState } = window.React;
 *   import * as d3 from 'd3'            → const d3 = window.d3;
 *   import { Card, CardHeader } from '@/components/ui/card'
 *                                       → const { Card, CardHeader } = window.__shadcn_card;
 *
 * Also handles mixed default + named: import React, { useState } from 'react'
 */
function rewriteImportsToGlobals(code: string): string {
  // Match import statements — handles multiline via [\s\S]
  return code.replace(
    /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, imports: string, specifier: string) => {
      // Check shadcn path aliases
      let globalName: string | undefined;
      if (specifier.startsWith('@/components/ui/')) {
        const component = specifier.split('/').pop()!;
        globalName = `__shadcn_${component.replace(/-/g, '_')}`;
      } else {
        globalName = VENDOR_GLOBALS[specifier];
      }

      if (!globalName) {
        // Unknown import — comment it out with a warning so it doesn't break parsing
        return `/* [atelier] unknown import: ${specifier} */`;
      }

      const trimmed = imports.trim();

      // `import * as X from 'pkg'`
      if (trimmed.startsWith('* as ')) {
        const name = trimmed.slice(5).trim();
        return `const ${name} = window.${globalName};`;
      }

      // `import { a, b as c } from 'pkg'`
      if (trimmed.startsWith('{')) {
        return `const ${trimmed} = window.${globalName};`;
      }

      // `import Default, { named } from 'pkg'` (mixed)
      const mixedMatch = trimmed.match(/^(\w+)\s*,\s*(\{[^}]+\})$/);
      if (mixedMatch) {
        const [, defaultName, namedImports] = mixedMatch;
        return `const ${defaultName} = window.${globalName}.default || window.${globalName};\nconst ${namedImports} = window.${globalName};`;
      }

      // `import Default from 'pkg'`
      return `const ${trimmed} = window.${globalName}.default || window.${globalName};`;
    }
  );
}

/**
 * Wraps the transformed code with a mount script that finds the component
 * and renders it into #root. Tries multiple export patterns:
 *   1. Explicit default export (most common for Claude artifacts)
 *   2. Named `App` export
 *   3. First exported function/class
 */
function wrapWithMount(code: string): string {
  // Since we're converting ESM → script, we need to capture exports.
  // Replace `export default` with an assignment to a known variable.
  let wrapped = code.replace(
    /export\s+default\s+/g,
    'var __atelier_default__ = '
  );

  // Replace named exports: `export function Foo` → `function Foo; __atelier_exports__.Foo = Foo`
  // and `export const Foo` → `const Foo; __atelier_exports__.Foo = Foo`
  const namedExports: string[] = [];
  wrapped = wrapped.replace(
    /export\s+(function|class|const|let|var)\s+(\w+)/g,
    (_match, keyword, name) => {
      namedExports.push(name);
      return `${keyword} ${name}`;
    }
  );

  // Handle `export { Foo as default, Bar }` — esbuild's common output pattern
  wrapped = wrapped.replace(
    /export\s*\{([^}]*)\}\s*;?/g,
    (_match, inner: string) => {
      const parts = inner.split(',').map(p => p.trim()).filter(Boolean);
      const assignments: string[] = [];
      for (const part of parts) {
        const asDefault = part.match(/^(\w+)\s+as\s+default$/);
        if (asDefault) {
          assignments.push(`var __atelier_default__ = ${asDefault[1]};`);
        } else {
          const asNamed = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
          if (asNamed) {
            const name = asNamed[1];
            namedExports.push(name);
          }
        }
      }
      return assignments.join('\n');
    }
  );

  // Append mount logic
  const exportAssignments = namedExports.length > 0
    ? namedExports.map(n => `__atelier_exports__.${n} = typeof ${n} !== 'undefined' ? ${n} : undefined;`).join('\n')
    : '';

  wrapped += `
;(function() {
  var __atelier_exports__ = {};
  ${exportAssignments}
  var Component = (typeof __atelier_default__ !== 'undefined' ? __atelier_default__ : null)
    || __atelier_exports__.App
    || Object.values(__atelier_exports__).find(function(v) { return typeof v === 'function'; });
  if (Component && window.React && window.ReactDOM) {
    try {
      var root = window.ReactDOM.createRoot(document.getElementById('root'));
      root.render(window.React.createElement(Component));
      window.parent.postMessage({ kind: 'mounted' }, '*');
    } catch(err) {
      window.parent.postMessage({ kind: 'error', message: String(err) }, '*');
    }
  } else if (!Component) {
    window.parent.postMessage({ kind: 'error', message: 'No renderable component found in artifact' }, '*');
  }
})();`;

  return wrapped;
}

/**
 * Full transform pipeline: JSX/TSX source → executable script for sandbox.
 */
export async function transformArtifact(
  source: string,
  loader: 'jsx' | 'tsx'
): Promise<string> {
  await ensureInit();

  // Step 1: Compile JSX/TSX → JS with ESM imports
  const result = await esbuildTransform(source, {
    loader,
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
    jsxImportSource: 'react',
  });

  // Step 2: Rewrite imports to window globals
  let code = rewriteImportsToGlobals(result.code);

  // Step 3: Wrap with export capture and mount logic
  code = wrapWithMount(code);

  return code;
}

export { VENDOR_GLOBALS };
