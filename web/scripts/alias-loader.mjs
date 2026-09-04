/**
 * Membuat modul di `src/` bisa diimpor oleh script Node biasa.
 *
 * Kode aplikasi memakai alias `@/...` dan impor tanpa ekstensi, dua hal yang
 * diselesaikan bundler Next tapi tidak oleh Node. Tanpa ini, lapisan layanan
 * hanya bisa dijalankan lewat server, sehingga alur bisnisnya tidak bisa diuji
 * ujung ke ujung dari baris perintah.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
const EXTS = ['.ts', '.tsx', '.js', '.mjs'];

/** Menambahkan ekstensi, atau `/index.*`, sebagaimana yang dilakukan bundler. */
function withExtension(absPath) {
  if (existsSync(absPath) && path.extname(absPath)) return absPath;
  for (const ext of EXTS) {
    if (existsSync(absPath + ext)) return absPath + ext;
  }
  for (const ext of EXTS) {
    const indexed = path.join(absPath, `index${ext}`);
    if (existsSync(indexed)) return indexed;
  }
  return null;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(path.join(SRC, specifier.slice(2)));
    if (resolved) return next(pathToFileURL(resolved).href, context);
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const resolved = withExtension(path.resolve(base, specifier));
    if (resolved) return next(pathToFileURL(resolved).href, context);
  }
  return next(specifier, context);
}
