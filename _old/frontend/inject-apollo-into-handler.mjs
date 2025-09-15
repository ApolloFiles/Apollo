import Fs from 'node:fs';

const handlerJsPath = 'build/handler.js';
const injectAfter = 'await server.respond(request, {';
const codeToInject = `
\t\t\tbefore_handle: (event, config, prerender) => {
\t\t\t\t(event.locals.apollo = {}).frontendRenderingDataAccess = process.apollo_hacky_frontend_rendering_data_access_class;
\t\t\t},`;

let handlerJs = Fs.readFileSync(handlerJsPath, 'utf-8');
if (!handlerJs.includes(injectAfter)) {
  throw new Error(`Unable to inject Apollo into ${handlerJsPath} (not found)`);
}
if (handlerJs.indexOf(injectAfter) !== handlerJs.lastIndexOf(injectAfter)) {
  throw new Error(`Unable to inject Apollo into ${handlerJsPath} (multiple occurrences)`);
}

handlerJs = handlerJs.replace(injectAfter, injectAfter + codeToInject);
Fs.writeFileSync(handlerJsPath, handlerJs, 'utf-8');

console.log(`Injected Apollo into ${handlerJsPath}`);
