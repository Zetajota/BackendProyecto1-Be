// Genera docs/endpoints.md leyendo los controladores compilados (dist/). No necesita MongoDB ni la API encendida.
// Uso: npm run docs:endpoints   (compila primero con nest build)
require('reflect-metadata');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
  console.error('No existe dist/. Ejecuta primero: npm run build');
  process.exit(1);
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const files = walk(dist).filter((f) => f.endsWith('.controller.js')).sort();
const rows = [];

for (const file of files) {
  for (const Ctrl of Object.values(require(file))) {
    if (typeof Ctrl !== 'function') continue;
    const base = Reflect.getMetadata('path', Ctrl);
    if (base === undefined) continue;
    const tag = (Reflect.getMetadata('swagger/apiUseTags', Ctrl) || [path.basename(file, '.controller.js')])[0];
    const classRoles = Reflect.getMetadata('roles', Ctrl);

    for (const name of Object.getOwnPropertyNames(Ctrl.prototype)) {
      const fn = Ctrl.prototype[name];
      if (name === 'constructor' || typeof fn !== 'function') continue;
      const method = Reflect.getMetadata('method', fn);
      if (method === undefined) continue;

      const route = ['api', base, Reflect.getMetadata('path', fn)].join('/').replace(/\/+/g, '/').replace(/\/$/, '');
      const roles = Reflect.getMetadata('roles', fn) || classRoles;
      const access = Reflect.getMetadata('isPublic', fn)
        ? 'Publico (sin token)'
        : roles && roles.length
          ? roles.join(' / ')
          : 'Cualquier usuario con sesion';
      const summary = (Reflect.getMetadata('swagger/apiOperation', fn) || {}).summary || '';
      rows.push({ tag, method: METHODS[method], route: '/' + route, access, summary });
    }
  }
}

const byTag = new Map();
for (const r of rows) {
  if (!byTag.has(r.tag)) byTag.set(r.tag, []);
  byTag.get(r.tag).push(r);
}

const out = [];
out.push('# Lista de endpoints');
out.push('');
out.push(`Generado automaticamente con \`npm run docs:endpoints\` (${rows.length} endpoints). No se edita a mano.`);
out.push('');
out.push('- Base: `http://localhost:3000` (todas las rutas empiezan con `/api`).');
out.push('- Autenticacion: `Authorization: Bearer <token>` (se obtiene en `POST /api/auth/login`).');
out.push('- La columna **Quien** indica los roles permitidos: `admin`, `docente`, `estudiante`.');
out.push('- Las rutas con `:id` esperan un ID de MongoDB de 24 caracteres. Documentacion interactiva: `/api/docs`.');
out.push('');
out.push('| Modulo | Endpoints |');
out.push('|---|---:|');
for (const [tag, list] of byTag) out.push(`| ${tag} | ${list.length} |`);
out.push('');

for (const [tag, list] of byTag) {
  out.push(`## ${tag}`);
  out.push('');
  out.push('| Metodo | Ruta | Quien | Para que sirve |');
  out.push('|---|---|---|---|');
  for (const r of list) out.push(`| ${r.method} | \`${r.route}\` | ${r.access} | ${r.summary} |`);
  out.push('');
}

const target = path.join(__dirname, '..', 'docs', 'endpoints.md');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out.join('\n'));
console.log(`docs/endpoints.md generado: ${rows.length} endpoints en ${byTag.size} modulos`);
