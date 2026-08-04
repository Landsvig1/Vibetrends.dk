/**
 * Pure logic for the Danish description backfill.
 *
 * Lives here rather than inside scripts/backfill-danish-descriptions.mjs so the
 * validation rules are unit-testable — same split as githubDocSource.ts, which
 * scripts/refresh-skill-docs.mjs imports the same way. The script owns the
 * database connection and file I/O; this module owns the decisions.
 */

/** A row the export pass emitted, after a translator filled in `descriptionDa`. */
export interface BackfillEntry {
  table?: string;
  id?: string;
  title?: string;
  /** Echoed from the export, unmodified — proves the pairing. */
  descriptionEn?: string;
  descriptionDa?: string;
  /** Deliberately leave this row untranslated. */
  skip?: boolean;
}

/** Current database state for one candidate row. */
export interface LiveRow {
  description_en: string;
  description_da: string | null;
}

export interface PlannedWrite {
  table: string;
  id: string;
  descriptionDa: string;
}

export interface ValidationResult {
  problems: string[];
  writes: PlannedWrite[];
}

/**
 * Tables carrying a translatable description, with the column holding the
 * human-readable name used for translator context.
 *
 * `agents` is restricted to the two catalog categories: Host rows are
 * connection targets with no detail page (getAgents excludes them from every
 * list), so translating them would be work nobody ever reads. The table holds
 * no Host rows today; the filter keeps a future one out of the set.
 */
export const BACKFILL_TABLES = [
  { name: 'skills', titleColumn: 'title_en', extraWhere: '' },
  { name: 'vibes', titleColumn: 'title_en', extraWhere: '' },
  { name: 'agents', titleColumn: 'name', extraWhere: ` and category in ('CLI','MCP Server')` },
] as const;

export function isBackfillTable(name: string | undefined): boolean {
  return BACKFILL_TABLES.some((t) => t.name === name);
}

/**
 * Check every entry against live database state before anything is written.
 *
 * Each guard covers a distinct failure mode, and none is redundant:
 *
 * - **`descriptionEn` mismatch** catches a translation paired with the wrong
 *   row. A 118-row translation pass has no ordering guarantee, and a shifted
 *   pairing would otherwise satisfy every other check and write plausible
 *   Danish onto the wrong entity permanently — permanently, because a re-run
 *   then rejects those rows as already-translated.
 * - **Equality with the English** catches an untranslated passthrough, which is
 *   the exact state migration 20260804000000 just cleared.
 * - **A non-null current value** catches someone having translated the row
 *   between export and apply; overwriting would silently discard their work.
 * - **A missing entry** catches a truncated or partially-written file. Skipping
 *   must be deliberate (`skip: true`), never the default, or a dropped subset
 *   is indistinguishable from work that was never started.
 *
 * Returns every problem found rather than stopping at the first, so one run
 * surfaces the whole list instead of making the caller re-run per fix.
 */
export function validateBackfillEntries(
  entries: BackfillEntry[],
  liveRows: Map<string, LiveRow>
): ValidationResult {
  const problems: string[] = [];
  const writes: PlannedWrite[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, i) => {
    const where = `entry ${i} (${entry.table ?? '?'}/${entry.id ?? '?'})`;

    if (!entry.table || !entry.id) {
      problems.push(`${where}: missing table or id`);
      return;
    }
    if (!isBackfillTable(entry.table)) {
      problems.push(`${where}: unknown table "${entry.table}"`);
      return;
    }

    const key = `${entry.table}/${entry.id}`;
    if (seen.has(key)) {
      problems.push(`${where}: duplicate entry for ${key}`);
      return;
    }
    seen.add(key);

    const live = liveRows.get(key);
    if (!live) {
      problems.push(`${where}: no such row in the database`);
      return;
    }

    if (entry.skip === true) return;

    if (entry.descriptionEn !== live.description_en) {
      problems.push(
        `${where}: descriptionEn does not match the live row — the translation may be paired with the wrong entry`
      );
      return;
    }
    if (live.description_da !== null) {
      problems.push(`${where}: description_da is already set; refusing to overwrite`);
      return;
    }

    const da = typeof entry.descriptionDa === 'string' ? entry.descriptionDa.trim() : '';
    if (!da) {
      problems.push(`${where}: descriptionDa is empty (use "skip": true to leave it untranslated)`);
      return;
    }
    if (da === live.description_en) {
      problems.push(`${where}: descriptionDa is identical to the English — untranslated passthrough`);
      return;
    }

    writes.push({ table: entry.table, id: entry.id, descriptionDa: da });
  });

  for (const key of liveRows.keys()) {
    if (!seen.has(key)) problems.push(`${key}: present in the database but missing from the file`);
  }

  return { problems, writes };
}
