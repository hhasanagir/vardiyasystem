import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HierarchyService } from '../src/modules/hierarchy/hierarchy.service';
import { PrismaService } from '../src/prisma.service';
import { createTestApp } from './test-app';

/**
 * D21: the unit spec only ever exercised the ltree SQL against a mocked
 * PrismaService, so nothing proved the queries actually run against a real
 * database. This test inserts a three-level hierarchy, runs the real
 * HierarchyService queries through Prisma, and cleans up afterwards.
 *
 * The service operates on a single table per call (it takes a `table`
 * argument), so all nesting here lives inside `hospitals`. A group and the
 * hospitals under it are independent tables, which is why ancestry is only
 * asserted within `hospitals`.
 */
describe('Hierarchy ltree queries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: HierarchyService;

  const groupId = randomUUID();
  const hospitalAId = randomUUID();
  const hospitalBId = randomUUID();
  const hospitalCId = randomUUID();
  const groupCode = `E2EGRP${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const hospitalACode = `E2EHOSPA${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const hospitalBCode = `E2EHOSPB${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const hospitalCCode = `E2EHOSPC${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const pathA = `${groupCode}.${hospitalACode}`;
  const pathB = `${pathA}.${hospitalBCode}`;
  const pathC = `${pathA}.${hospitalCCode}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(HierarchyService);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "hospital_groups" (id, name, code, path, "updatedAt")
       VALUES ($1, $2, $3, public.text2ltree($3), now())`,
      groupId,
      'E2E Hierarchy Group',
      groupCode,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "hospitals" (id, "groupId", name, code, path, "updatedAt")
       VALUES ($1, $2, $3, $4, public.text2ltree($5), now())`,
      hospitalAId,
      groupId,
      'E2E Hierarchy Hospital A',
      hospitalACode,
      pathA,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "hospitals" (id, "groupId", name, code, path, "updatedAt")
       VALUES ($1, $2, $3, $4, public.text2ltree($5), now())`,
      hospitalBId,
      groupId,
      'E2E Hierarchy Hospital B',
      hospitalBCode,
      pathB,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "hospitals" (id, "groupId", name, code, path, "updatedAt")
       VALUES ($1, $2, $3, $4, public.text2ltree($5), now())`,
      hospitalCId,
      groupId,
      'E2E Hierarchy Hospital C',
      hospitalCCode,
      pathC,
    );
  });

  afterAll(async () => {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "hospitals" WHERE id = ANY($1::text[])`,
        [hospitalAId, hospitalBId, hospitalCId],
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "hospital_groups" WHERE id = $1`,
        groupId,
      );
    } finally {
      await app.close();
    }
  });

  it('returns the inserted group as a root node', async () => {
    const roots = await service.getRootNodes('hospital_groups');
    expect(roots.map((node) => node.path)).toContain(groupCode);
  });

  it('returns the hospitals as descendants of the group', async () => {
    const descendants = await service.getDescendants('hospitals', groupCode);
    const paths = descendants.map((node) => node.path);
    expect(paths).toContain(pathA);
    expect(paths).toContain(pathB);
    expect(paths).toContain(pathC);
  });

  it('honours maxDepth when listing descendants', async () => {
    const descendants = await service.getDescendants('hospitals', groupCode, 1);
    const paths = descendants.map((node) => node.path);
    expect(paths).toContain(pathA);
    expect(paths).not.toContain(pathB);
  });

  it('returns direct children only', async () => {
    const children = await service.getChildren('hospitals', groupCode);
    const paths = children.map((node) => node.path);
    expect(paths).toContain(pathA);
    expect(paths).not.toContain(pathB);
  });

  it('returns the parent hospital as an ancestor of the nested hospital', async () => {
    const ancestors = await service.getAncestors('hospitals', pathB);
    const paths = ancestors.map((node) => node.path);
    expect(paths).toContain(pathA);
    expect(paths).not.toContain(pathB);
  });

  it('includes self when asked', async () => {
    const subtree = await service.getDescendantsIncludingSelf(
      'hospitals',
      pathA,
    );
    expect(subtree.map((node) => node.path)).toContain(pathB);
    const lineage = await service.getAncestorsIncludingSelf('hospitals', pathB);
    expect(lineage.map((node) => node.path)).toContain(pathB);
  });

  it('reports ancestry and depth via ltree operators', async () => {
    expect(await service.isDescendant(pathB, groupCode)).toBe(true);
    expect(await service.isAncestor(groupCode, pathB)).toBe(true);
    expect(await service.isDescendant(groupCode, pathB)).toBe(false);
    expect(await service.getDepth(groupCode)).toBe(1);
    expect(await service.getDepth(pathB)).toBe(3);
  });

  it('returns the lowest common ancestor of two siblings', async () => {
    // ltree's lca() returns the longest common prefix, but drops the deepest
    // shared label when that prefix equals one of the arguments (see the docs
    // example lca('1.2.3','1.2.3.4.5.6') = 1.2). Two siblings therefore give
    // their shared parent, while a node plus its ancestor gives the parent of
    // that ancestor.
    expect(await service.getLowestCommonAncestor(pathB, pathC)).toBe(pathA);
    expect(await service.getLowestCommonAncestor(pathB, pathA)).toBe(groupCode);
  });
});
