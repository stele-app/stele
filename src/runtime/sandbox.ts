/**
 * Sandbox document generator.
 *
 * Builds a complete HTML document string for use as iframe `srcdoc`.
 * Everything is inlined — no external fetches needed from the opaque origin.
 *
 * Contents:
 * - Tailwind Play CDN script (JIT CSS generation)
 * - Vendor UMD scripts (React, ReactDOM, etc.) assigned to window globals
 * - Boot script (storage shim, link interception, postMessage bridge)
 * - Transformed artifact code with mount logic
 */

/** Vendor scripts loaded from disk, cached after first load */
let vendorScriptsCache: string | null = null;

/**
 * Load all vendor UMD scripts from the vendor/ directory.
 * In the Vite dev server, these are served from the project root.
 * In production (Tauri), they'll be read from the app's resource dir.
 */
export async function loadVendorScripts(): Promise<string> {
  if (vendorScriptsCache) return vendorScriptsCache;

  const vendorFiles = [
    'react.umd.js',
    'react-jsx-runtime.umd.js',
    'react-dom.umd.js',
    'lucide-react.umd.js',
    'recharts.umd.js',
  ];

  const scripts: string[] = [];
  for (const file of vendorFiles) {
    try {
      const resp = await fetch(`./vendor/${file}`);
      if (resp.ok) {
        const code = await resp.text();
        scripts.push(`<script>/* ${file} */${code}</script>`);
      }
    } catch {
      console.warn(`[sandbox] Failed to load vendor/${file}`);
    }
  }

  vendorScriptsCache = scripts.join('\n');
  return vendorScriptsCache;
}

/**
 * The boot script that runs inside the sandbox iframe.
 * Sets up:
 * - window.storage shim (postMessage RPC to host)
 * - External link interception (opens in OS browser)
 * - postMessage listener for RPC responses
 */
const BOOT_SCRIPT = `
(function() {
  var HOST = window.parent;
  var pending = new Map();
  var rpcId = 0;

  function rpc(method, params) {
    return new Promise(function(resolve, reject) {
      var id = ++rpcId;
      pending.set(id, { resolve: resolve, reject: reject });
      HOST.postMessage({ kind: 'rpc', id: id, method: method, params: params }, '*');
    });
  }

  // window.storage shim — matches Claude's artifact spec API
  window.storage = {
    get:    function(key, shared) { return rpc('storage.get',    { key: key, shared: !!shared }); },
    set:    function(key, value, shared) { return rpc('storage.set',    { key: key, value: value, shared: !!shared }); },
    delete: function(key, shared) { return rpc('storage.delete', { key: key, shared: !!shared }); },
    list:   function(prefix, shared) { return rpc('storage.list',   { prefix: prefix, shared: !!shared }); },
  };

  // Intercept external links — open in OS default browser
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href && /^https?:\\/\\//.test(href)) {
      e.preventDefault();
      rpc('shell.open', { url: href });
    }
  });

  // Listen for RPC responses from the host
  window.addEventListener('message', function(ev) {
    var msg = ev.data;
    if (msg && msg.kind === 'rpc-result') {
      var p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) { p.reject(new Error(msg.error)); }
      else { p.resolve(msg.result); }
    }
  });

  // Signal readiness to host
  HOST.postMessage({ kind: 'ready' }, '*');
})();
`;

/**
 * Build the complete sandbox HTML document.
 *
 * @param transformedCode - Artifact code after JSX compile + import rewriting + mount wrapping
 * @returns Complete HTML string suitable for iframe srcdoc
 */
export async function buildSandboxDoc(transformedCode: string): Promise<string> {
  const vendorHtml = await loadVendorScripts();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  #root { min-height: 100vh; }
</style>
${vendorHtml}
<script>${BOOT_SCRIPT}<\/script>
</head>
<body>
<div id="root"></div>
<script>
try {
${transformedCode}
} catch(err) {
  document.getElementById('root').innerHTML =
    '<div style="padding:2rem;color:#ef4444;font-family:monospace">' +
    '<h2 style="margin:0 0 1rem">Artifact Error</h2>' +
    '<pre style="white-space:pre-wrap;word-break:break-word">' + String(err) + '</pre></div>';
  window.parent.postMessage({ kind: 'error', message: String(err) }, '*');
}
<\/script>
</body>
</html>`;
}
