import { getDb } from '@/database';
import { AppError } from '@/lib/errors';
import { uuid } from '@/lib/ids';
import type { KhataEntry, KhataKind, LocalKhataEntry } from '@/types/domain';

import { findAll, findById, saveRecord, softDelete } from './entityStore';
import { likePattern } from './taskRepository';

export type KhataInput = {
  kind: KhataKind;
  party?: string | null;
  description?: string | null;
  amount_paise: number;
  entry_date: string;
};

export type KhataFilter = {
  kind?: KhataKind;
  search?: string;
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
};

export type KhataTotals = { bought: number; gave: number; got: number };

/** Net position with one person: positive = they owe you (you gave more), negative = you owe them. */
export type PartyBalance = { party: string; gave: number; got: number; net: number; last_date: string };

export const MAX_AMOUNT_PAISE = 99_999_999_999;

/** "1,250.5" → 125050 paise; null when it is not a positive amount with at most 2 decimals. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [rupees, paise = ''] = clean.split('.');
  const value = Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
  return value > 0 && value <= MAX_AMOUNT_PAISE ? value : null;
}

/** 125050 → "₹1,250.50" (Indian digit grouping; paise shown only when present). */
export function formatAmount(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = String(Math.floor(abs / 100));
  const rest = abs % 100;
  const last3 = rupees.slice(-3);
  const head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${head ? `${head},${last3}` : last3}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

function validate(input: KhataInput): KhataInput {
  const party = input.party?.trim() || null;
  const description = input.description?.trim() || null;
  if (!['bought', 'gave', 'got'].includes(input.kind)) throw new AppError('validation', { userMessage: 'Choose what kind of entry this is.' });
  if (!Number.isInteger(input.amount_paise) || input.amount_paise <= 0 || input.amount_paise > MAX_AMOUNT_PAISE) throw new AppError('validation', { userMessage: 'Enter an amount greater than zero.' });
  if (input.kind === 'bought' && !description) throw new AppError('validation', { userMessage: 'Write what you bought.' });
  if (input.kind !== 'bought' && !party) throw new AppError('validation', { userMessage: input.kind === 'gave' ? 'Write who you paid.' : 'Write who paid you.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entry_date)) throw new AppError('validation', { userMessage: 'Pick a date.' });
  return { kind: input.kind, party: party?.slice(0, 80) ?? null, description: description?.slice(0, 200) ?? null, amount_paise: input.amount_paise, entry_date: input.entry_date };
}

function where(filter: KhataFilter): { sql: string; params: string[] } {
  const clauses = ['deleted_at IS NULL'];
  const params: string[] = [];
  if (filter.kind) {
    clauses.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.from) {
    clauses.push('entry_date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push('entry_date <= ?');
    params.push(filter.to);
  }
  const term = filter.search?.trim();
  if (term) {
    clauses.push("(party LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(likePattern(term), likePattern(term));
  }
  return { sql: clauses.join(' AND '), params };
}

export const khataRepository = {
  list(filter: KhataFilter = {}): Promise<LocalKhataEntry[]> {
    const w = where(filter);
    return findAll<LocalKhataEntry>('khata_entries', w.sql, w.params, 'entry_date DESC, created_at DESC');
  },

  get(id: string): Promise<LocalKhataEntry | null> {
    return findById<LocalKhataEntry>('khata_entries', id);
  },

  async totals(filter: Pick<KhataFilter, 'from' | 'to'> = {}): Promise<KhataTotals> {
    const w = where(filter);
    const rows = await getDb().all<{ kind: KhataKind; total: number }>(`SELECT kind, SUM(amount_paise) AS total FROM khata_entries WHERE ${w.sql} GROUP BY kind`, w.params);
    const out: KhataTotals = { bought: 0, gave: 0, got: 0 };
    for (const r of rows) out[r.kind] = Number(r.total) || 0;
    return out;
  },

  /** Running balance with every person you gave to or got from (names match case-insensitively). */
  async balances(): Promise<PartyBalance[]> {
    const rows = await getDb().all<{ party: string; gave: number; got: number; last_date: string }>(
      `SELECT MAX(party) AS party,
              SUM(CASE WHEN kind = 'gave' THEN amount_paise ELSE 0 END) AS gave,
              SUM(CASE WHEN kind = 'got' THEN amount_paise ELSE 0 END) AS got,
              MAX(entry_date) AS last_date
         FROM khata_entries
        WHERE deleted_at IS NULL AND kind IN ('gave', 'got') AND party IS NOT NULL
        GROUP BY party COLLATE NOCASE
        ORDER BY MAX(entry_date) DESC`,
    );
    return rows.map((r) => ({ party: r.party, gave: Number(r.gave), got: Number(r.got), net: Number(r.gave) - Number(r.got), last_date: r.last_date }));
  },

  async create(input: KhataInput): Promise<KhataEntry> {
    return saveRecord<KhataEntry>('khata_entries', uuid(), validate(input));
  },

  async update(id: string, input: KhataInput): Promise<KhataEntry> {
    return saveRecord<KhataEntry>('khata_entries', id, validate(input));
  },

  remove(id: string): Promise<void> {
    return softDelete('khata_entries', id);
  },
};
