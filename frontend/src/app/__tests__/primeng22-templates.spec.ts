import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PrimeNG 22 removed the deprecated `pTemplate` directive. Components now
 * resolve their templates through template reference variables (for example
 * `contentChild('footer')`), so a leftover legacy footer template silently drops
 * the dialog footer — including its export buttons — without any build error.
 * The legacy attribute is intentionally not spelled out below so this guard
 * does not flag its own source.
 */
const srcRoot = resolve(process.cwd(), 'src');

function collectTemplates(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) collectTemplates(path, files);
    else if (/\.(html|ts)$/.test(entry)) files.push(path);
  }
  return files;
}

describe('PrimeNG 22 template API', () => {
  it('does not leave any legacy pTemplate attributes in source templates', () => {
    const stale = collectTemplates(srcRoot).filter((path) => /\bpTemplate\s*=/.test(readFileSync(path, 'utf8')));
    expect(stale).toEqual([]);
  });

  it('keeps the report export actions inside the dialog footer template', () => {
    const reports = readFileSync(`${srcRoot}/app/components/reports/reports.component.html`, 'utf8');
    const footer = reports.match(/<ng-template #footer>([\s\S]*?)<\/ng-template>/)?.[1] ?? '';
    expect(footer).toContain('class="btn-cancel"');
    expect(footer).toContain('class="btn-export"');
  });
});
