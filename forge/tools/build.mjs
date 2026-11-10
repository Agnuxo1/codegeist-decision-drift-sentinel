// Local SDK bundling only. This command cannot register, deploy or install an app.
import {build} from 'esbuild';
await build({entryPoints:['src/index.js'],bundle:true,platform:'node',format:'cjs',
  target:'node24',outdir:'dist/backend',logLevel:'warning'});
await build({entryPoints:['src/frontend/issue.tsx','src/frontend/source.tsx'],bundle:true,
  platform:'browser',format:'esm',target:'es2022',outdir:'dist/frontend',logLevel:'warning'});
console.log('Backend and both UI Kit entry points bundled locally; no cloud validation or deployment.');
