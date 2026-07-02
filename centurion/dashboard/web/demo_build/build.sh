# Rebuild the self-contained ../../demo.html (static SSR + hydrating client).
# Requires the parent web/ deps installed (npm install) + tailwindcss.
set -e
cd "$(dirname "$0")"
ESB="node -e"
node -e "require('../node_modules/esbuild').build({entryPoints:['client.jsx'],bundle:true,minify:true,format:'iife',loader:{'.jsx':'jsx'},define:{'process.env.NODE_ENV':'\"production\"'},outfile:'client.js'})"
node -e "require('../node_modules/esbuild').build({entryPoints:['ssr.jsx'],bundle:true,format:'cjs',platform:'node',loader:{'.jsx':'jsx'},define:{'process.env.NODE_ENV':'\"production\"'},outfile:'ssr.cjs'})"
node ssr.cjs > ssr_markup.html
printf "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n" > _tw_in.css
npx tailwindcss -i _tw_in.css -o tw.css --content ./app.jsx --minify
echo "now run the assemble step (see git history) to write ../../demo.html"
