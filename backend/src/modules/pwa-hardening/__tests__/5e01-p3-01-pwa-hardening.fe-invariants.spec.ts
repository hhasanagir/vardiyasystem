import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BACKEND = join(__dirname, '..', '..', '..', '..')
const ROOT = join(BACKEND, '..')
const FRONTEND = join(ROOT, 'frontend')
const SRC = join(BACKEND, 'src')
const APP = join(FRONTEND, 'src', 'app')

function txt(p: string): string { return readFileSync(p, 'utf8') }

function walk(dir: string, pred: (n: string) => boolean): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    // skip node_modules, dist, .git, coverage, hidden
    if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'coverage' || e.startsWith('.')) continue
    try {
      const st = statSync(p)
      if (st.isDirectory()) out.push(...walk(p, pred))
      else if (pred(e)) out.push(p)
    } catch { }
  }
  return out
}

function appFile(...parts: string[]): string { return join(FRONTEND, 'src', 'app', ...parts) }

const NON_V1 = /(["'`])\/api\/(?!v1)/g

describe('P3.1 PWA hardening - FE invariants (deterministic artifact gate)', () => {
  it('backend main.ts sets global prefix /api and never a non-v1 variant', () => {
    const s = txt(join(SRC, 'main.ts'))
    expect(s).toMatch(/setGlobalPrefix/)
    expect(s).toMatch(/['"]api['"]/)
  })

  it('ngsw-config.json dataGroups is EMPTY (no API data caching)', () => {
    const p = join(FRONTEND, 'ngsw-config.json')
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(txt(p))
    expect(Array.isArray(cfg.dataGroups)).toBe(true)
    expect(cfg.dataGroups).toHaveLength(0)
    expect(cfg.dataGroups.length).toBe(0)
  })

  it('barrel services index does not export offline queues/sync/api-cache classes', () => {
    const idx = appFile('services', 'index.ts')
    expect(existsSync(idx)).toBe(true)
    const s = txt(idx)
    expect(s).not.toMatch(/OfflineQueue/)
    expect(s).not.toMatch(/BackgroundSync/)
    expect(s).not.toMatch(/ApiCache/)
    expect(s).not.toMatch(/OfflineService/)
    expect(s).not.toMatch(/SyncService/)
    expect(s).not.toMatch(/ApiService/)
  })

  it('environments.ts apiUrl is canonical /api/v1', () => {
    const e = join(APP, 'environments.ts')
    expect(existsSync(e)).toBe(true)
    expect(txt(e)).toMatch(/apiUrl:\s*['"]\/api\/v1['"]/)
  })

  it('environments.prod.ts apiUrl is canonical /api/v1', () => {
    const e = join(APP, 'environments.prod.ts')
    expect(existsSync(e)).toBe(true)
    expect(txt(e)).toMatch(/apiUrl:\s*['"]\/api\/v1['"]/)
  })

  it('proxy.conf.json maps /api to localhost:3000 (no non-v1 rewrite)', () => {
    const p = join(FRONTEND, 'proxy.conf.json')
    expect(existsSync(p)).toBe(true)
    const s = txt(p)
    expect(s).toMatch(/\/api\b/)
    expect(s).toMatch(/3000/)
  })

  it('nginx gateway only proxies /api/v1 and serves no non-v1 /api/ literal', () => {
    const p = join(FRONTEND, 'nginx.conf')
    expect(existsSync(p)).toBe(true)
    const s = txt(p)
    expect(s).toMatch(/\/api\/v1/)
    NON_V1.lastIndex = 0
    expect(s.match(NON_V1)).toBeNull()
  })

  it('no FE source file carries a non-v1 /api/ URL literal (quote-anchored)', () => {
    let bad = 0
    for (const f of walk(APP, (n) => /\.(ts|html|json)$/.test(n))) {
      const s = txt(f)
      NON_V1.lastIndex = 0
      if (NON_V1.test(s)) { bad++; console.log('  NON-V1 literal in: ' + f) }
    }
    expect(bad).toBe(0)
  })

  it('dormant FE service specs only reference canonical /api/v1', () => {
    const t = appFile('services', '__tests__')
    for (const f of walk(t, (n) => n.endsWith('spec.ts'))) {
      const s = txt(f)
      // Specs that reference any /api literal must use the canonical prefix.
      // Pure mock specs (no URL literals at all) have nothing to violate.
      if (/\/api/.test(s) && !/\/api\/v1/.test(s)) {
        throw new Error('spec references /api without the canonical /api/v1 prefix: ' + f)
      }
      NON_V1.lastIndex = 0
      if (NON_V1.test(s)) throw new Error('non-v1 /api/ literal in spec: ' + f)
    }
  })
})