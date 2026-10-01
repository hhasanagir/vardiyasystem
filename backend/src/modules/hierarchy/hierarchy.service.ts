import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class HierarchyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAncestors(
    table: string,
    path: string,
  ): Promise<{ id: string; name: string; path: string; depth: number }[]> {
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string; depth: number }[]
    >(
      `SELECT id, name::text, path::text, nlevel(path) as depth
       FROM "${table}"
       WHERE path @> $1::ltree AND path != $1::ltree
       ORDER BY depth`,
      path,
    );
  }

  async getAncestorsIncludingSelf(
    table: string,
    path: string,
  ): Promise<{ id: string; name: string; path: string; depth: number }[]> {
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string; depth: number }[]
    >(
      `SELECT id, name::text, path::text, nlevel(path) as depth
       FROM "${table}"
       WHERE path @> $1::ltree
       ORDER BY depth`,
      path,
    );
  }

  async getDescendants(
    table: string,
    path: string,
    maxDepth?: number,
  ): Promise<{ id: string; name: string; path: string; depth: number }[]> {
    const depthFilter =
      maxDepth !== undefined
        ? `AND nlevel(path) - nlevel($1::ltree) <= ${maxDepth}`
        : '';
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string; depth: number }[]
    >(
      `SELECT id, name::text, path::text, nlevel(path) as depth
       FROM "${table}"
       WHERE path <@ $1::ltree AND path != $1::ltree ${depthFilter}
       ORDER BY depth`,
      path,
    );
  }

  async getDescendantsIncludingSelf(
    table: string,
    path: string,
    maxDepth?: number,
  ): Promise<{ id: string; name: string; path: string; depth: number }[]> {
    const depthFilter =
      maxDepth !== undefined
        ? `AND nlevel(path) - nlevel($1::ltree) <= ${maxDepth}`
        : '';
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string; depth: number }[]
    >(
      `SELECT id, name::text, path::text, nlevel(path) as depth
       FROM "${table}"
       WHERE path <@ $1::ltree ${depthFilter}
       ORDER BY depth`,
      path,
    );
  }

  async getSubtree(
    table: string,
    path: string,
    maxDepth: number,
  ): Promise<{ id: string; name: string; path: string; depth: number }[]> {
    return this.getDescendantsIncludingSelf(table, path, maxDepth);
  }

  async isDescendant(
    descendantPath: string,
    ancestorPath: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRawUnsafe<
      { is_descendant: boolean }[]
    >(
      `SELECT $1::ltree <@ $2::ltree as is_descendant`,
      descendantPath,
      ancestorPath,
    );
    return result[0]?.is_descendant ?? false;
  }

  async isAncestor(
    ancestorPath: string,
    descendantPath: string,
  ): Promise<boolean> {
    return this.isDescendant(descendantPath, ancestorPath);
  }

  async getLowestCommonAncestor(
    path1: string,
    path2: string,
  ): Promise<string | null> {
    const result = await this.prisma.$queryRawUnsafe<{ lca: string | null }[]>(
      `SELECT lca($1::ltree, $2::ltree)::text as lca`,
      path1,
      path2,
    );
    return result[0]?.lca ?? null;
  }

  async getDepth(path: string): Promise<number> {
    const result = await this.prisma.$queryRawUnsafe<{ depth: number }[]>(
      `SELECT nlevel($1::ltree) as depth`,
      path,
    );
    return result[0]?.depth ?? 0;
  }

  async getRootNodes(
    table: string,
  ): Promise<{ id: string; name: string; path: string }[]> {
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string }[]
    >(
      `SELECT id, name::text, path::text
       FROM "${table}"
       WHERE nlevel(path) = 1
       ORDER BY path`,
    );
  }

  async getChildren(
    table: string,
    path: string,
  ): Promise<{ id: string; name: string; path: string }[]> {
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string }[]
    >(
      `SELECT id, name::text, path::text
       FROM "${table}"
       WHERE path ~ $1::lquery
       ORDER BY path`,
      `${path}.*{1}`,
    );
  }

  async getLeafNodes(
    table: string,
  ): Promise<{ id: string; name: string; path: string }[]> {
    return this.prisma.$queryRawUnsafe<
      { id: string; name: string; path: string }[]
    >(
      `SELECT id, name::text, path::text
       FROM "${table}" a
       WHERE NOT EXISTS (
         SELECT 1 FROM "${table}" b
         WHERE b.path <@ a.path AND b.path != a.path
       )
       ORDER BY path`,
    );
  }

  async computePath(
    table: string,
    id: string,
    parentIdColumn: string,
    nameColumn: string,
  ): Promise<string> {
    const result = await this.prisma.$queryRawUnsafe<{ path: string | null }[]>(
      `WITH RECURSIVE node_path AS (
         SELECT id, name::text as label, 1 as lvl
         FROM "${table}" WHERE id = $1
         UNION ALL
         SELECT p.id, p.name::text, np.lvl + 1
         FROM "${table}" p
         INNER JOIN "${table}" c ON c."${parentIdColumn}" = p.id
         INNER JOIN node_path np ON np.id = c.id
       )
       SELECT array_to_string(array_agg(label ORDER BY lvl DESC), '.') as path
       FROM node_path`,
      id,
    );
    return result[0]?.path ?? '';
  }

  async moveSubtree(
    table: string,
    id: string,
    newParentPath: string,
    nameColumn: string,
  ): Promise<number> {
    const result = await this.prisma.$queryRawUnsafe<{ moved: number }[]>(
      `WITH moved_node AS (
         SELECT id, path FROM "${table}" WHERE id = $1
       ),
       update_paths AS (
         SELECT
           m.id as old_id,
           $2::ltree || subpath(m.path, nlevel($3::ltree)) as new_path
         FROM moved_node m
         CROSS JOIN (SELECT $3::ltree as old_parent) _
       )
       UPDATE "${table}" t
       SET path = up.new_path
       FROM update_paths up
       WHERE t.id = up.old_id
       RETURNING t.id`,
      id,
      newParentPath,
      '',
    );

    const descendantResult = await this.prisma.$queryRawUnsafe<
      { moved: number }[]
    >(
      `WITH moved_node AS (
         SELECT id, path FROM "${table}" WHERE id = $1
       ),
       descendants AS (
         SELECT c.id, c.path
         FROM "${table}" c, moved_node m
         WHERE c.path <@ m.path AND c.id != m.id
       ),
       update_paths AS (
         SELECT
           d.id as old_id,
           $2::ltree || subpath(d.path, nlevel((SELECT path FROM moved_node))) as new_path
         FROM descendants d
       )
       UPDATE "${table}" t
       SET path = up.new_path
       FROM update_paths up
       WHERE t.id = up.old_id
       RETURNING t.id`,
      id,
      newParentPath,
    );

    return (result?.length ?? 0) + (descendantResult?.length ?? 0);
  }
}
