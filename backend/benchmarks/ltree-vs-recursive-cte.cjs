const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ITERATIONS = 5;
const WARMUP = 2;

async function measure(label, fn) {
  const timings = [];
  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    const rows = await fn();
    const end = process.hrtime.bigint();
    if (i >= WARMUP) {
      timings.push(Number(end - start) / 1e6);
    }
    if (i === 0) console.log(`  ${label}: got ${rows.length} rows`);
  }
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const min = Math.min(...timings);
  const max = Math.max(...timings);
  console.log(
    `  ${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms (${ITERATIONS} runs)`,
  );
  return { avg, min, max, timings };
}

async function main() {
  console.log('\n=== Hierarchy Query Benchmarks: ltree vs Recursive CTE ===\n');

  // 1. Get descendants via ltree
  console.log('1. Get all descendants of SYSTEM_ADMIN:');
  const ltreeDesc = await measure('ltree <@', () =>
    prisma.$queryRawUnsafe(
      `SELECT id, path::text FROM roles WHERE path <@ 'SYSTEM_ADMIN'::ltree ORDER BY path`,
    ),
  );

  const cteDesc = await measure('recursive CTE', () =>
    prisma.$queryRawUnsafe(
      `WITH RECURSIVE role_tree AS (
         SELECT id, name::text, "parentId", 1 as depth FROM roles WHERE "parentId" IS NULL AND name = 'SYSTEM_ADMIN'::"RbacRoleName"
         UNION ALL
         SELECT r.id, r.name::text, r."parentId", rt.depth + 1
         FROM roles r INNER JOIN role_tree rt ON r."parentId" = rt.id
       )
       SELECT id, name FROM role_tree ORDER BY depth`,
    ),
  );

  // 2. Get ancestors via ltree
  console.log('\n2. Get all ancestors of TECHNICIAN:');
  const ltreeAnc = await measure('ltree @>', () =>
    prisma.$queryRawUnsafe(
      `SELECT id, path::text FROM roles WHERE path @> 'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR.IMAGING_MANAGER.UNIT_SUPERVISOR.SHIFT_COORDINATOR.TECHNICIAN'::ltree AND path != 'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR.IMAGING_MANAGER.UNIT_SUPERVISOR.SHIFT_COORDINATOR.TECHNICIAN'::ltree ORDER BY path`,
    ),
  );

  const cteAnc = await measure('recursive CTE', () =>
    prisma.$queryRawUnsafe(
      `WITH RECURSIVE role_ancestors AS (
         SELECT id, name::text, "parentId", 1 as depth FROM roles WHERE name = 'TECHNICIAN'::"RbacRoleName"
         UNION ALL
         SELECT r.id, r.name::text, r."parentId", ra.depth + 1
         FROM roles r INNER JOIN role_ancestors ra ON r.id = ra."parentId"
       )
       SELECT id, name FROM role_ancestors WHERE depth > 1 ORDER BY depth DESC`,
    ),
  );

  // 3. Check if descendant (ltree vs recursive CTE)
  console.log('\n3. Is TECHNICIAN descendant of SYSTEM_ADMIN?:');
  const ltreeDescCheck = await measure('ltree <@', () =>
    prisma.$queryRawUnsafe(
      `SELECT 'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR.IMAGING_MANAGER.UNIT_SUPERVISOR.SHIFT_COORDINATOR.TECHNICIAN'::ltree <@ 'SYSTEM_ADMIN'::ltree as result`,
    ),
  );

  const cteDescCheck = await measure('recursive CTE', () =>
    prisma.$queryRawUnsafe(
      `WITH RECURSIVE role_tree AS (
         SELECT id, "parentId" FROM roles WHERE "parentId" IS NULL AND name = 'SYSTEM_ADMIN'::"RbacRoleName"
         UNION ALL
         SELECT r.id, r."parentId" FROM roles r INNER JOIN role_tree rt ON r."parentId" = rt.id
       )
       SELECT EXISTS(SELECT 1 FROM role_tree WHERE id = (SELECT id FROM roles WHERE name = 'TECHNICIAN'::"RbacRoleName")) as result`,
    ),
  );

  // 4. Get depth via ltree
  console.log('\n4. Get depth (path length):');
  const ltreeDepth = await measure('nlevel()', () =>
    prisma.$queryRawUnsafe(
      `SELECT nlevel('SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR.IMAGING_MANAGER.UNIT_SUPERVISOR.SHIFT_COORDINATOR.TECHNICIAN'::ltree) as depth`,
    ),
  );

  const cteDepth = await measure('recursive CTE', () =>
    prisma.$queryRawUnsafe(
      `WITH RECURSIVE role_ancestors AS (
         SELECT id, "parentId", 1 as depth FROM roles WHERE name = 'TECHNICIAN'::"RbacRoleName"
         UNION ALL
         SELECT r.id, r."parentId", ra.depth + 1
         FROM roles r INNER JOIN role_ancestors ra ON r.id = ra."parentId"
       )
       SELECT MAX(depth) as depth FROM role_ancestors`,
    ),
  );

  // 5. Get children via ltree lquery vs recursive CTE (depth = 1)
  console.log('\n5. Get direct children of HOSPITAL_DIRECTOR:');
  const ltreeChildren = await measure('ltree ~ lquery', () =>
    prisma.$queryRawUnsafe(
      `SELECT id, path::text FROM roles WHERE path ~ 'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR.*{1}'::lquery ORDER BY path`,
    ),
  );

  const cteChildren = await measure('recursive CTE (depth=1)', () =>
    prisma.$queryRawUnsafe(
      `WITH RECURSIVE role_tree AS (
         SELECT id, name::text, "parentId", 1 as depth FROM roles WHERE name = 'HOSPITAL_DIRECTOR'::"RbacRoleName"
         UNION ALL
         SELECT r.id, r.name::text, r."parentId", rt.depth + 1
         FROM roles r INNER JOIN role_tree rt ON r."parentId" = rt.id
       )
       SELECT id, name FROM role_tree WHERE depth = 2 ORDER BY name`,
    ),
  );

  console.log('\n=== Summary ===');
  const comparisons = [
    { name: 'Descendants', ltree: ltreeDesc.avg, cte: cteDesc.avg },
    { name: 'Ancestors', ltree: ltreeAnc.avg, cte: cteAnc.avg },
    { name: 'Is Descendant', ltree: ltreeDescCheck.avg, cte: cteDescCheck.avg },
    { name: 'Depth', ltree: ltreeDepth.avg, cte: cteDepth.avg },
    { name: 'Children', ltree: ltreeChildren.avg, cte: cteChildren.avg },
  ];
  console.log('Query                     | ltree (ms) | CTE (ms) | Speedup');
  console.log('--------------------------|------------|----------|--------');
  for (const c of comparisons) {
    const speedup = c.cte > 0 ? (c.cte / c.ltree).toFixed(2) : 'N/A';
    const ltreeStr = c.ltree.toFixed(2).padStart(8);
    const cteStr = c.cte.toFixed(2).padStart(8);
    console.log(
      `${c.name.padEnd(26)} | ${ltreeStr}   | ${cteStr}  | ${speedup}x`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
