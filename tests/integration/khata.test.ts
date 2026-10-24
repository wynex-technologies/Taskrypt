import { getDb } from '@/database';
import { formatAmount, khataRepository, parseAmount } from '@/repositories/khataRepository';
import * as queue from '@/repositories/syncQueueRepository';

import { onDevice, resetAllDevices, USER_A } from '../helpers/db';

beforeEach(async () => {
  await resetAllDevices();
  await onDevice('phone-a', USER_A);
});

describe('amounts', () => {
  it('parses rupees into whole paise', () => {
    expect(parseAmount('250')).toBe(25_000);
    expect(parseAmount('1,250.5')).toBe(125_050);
    expect(parseAmount('₹ 99.99')).toBe(9_999);
    for (const bad of ['', '0', '-5', '1.234', 'abc', '1e3']) expect(parseAmount(bad)).toBeNull();
  });

  it('formats with Indian digit grouping', () => {
    expect(formatAmount(25_000)).toBe('₹250');
    expect(formatAmount(125_050)).toBe('₹1,250.50');
    expect(formatAmount(1_234_567_800)).toBe('₹1,23,45,678');
    expect(formatAmount(-5_000)).toBe('-₹50');
  });
});

describe('khata entries', () => {
  it('saves entries through the sync queue and lists them newest first', async () => {
    await khataRepository.create({ kind: 'bought', description: 'Groceries', party: 'Kirana', amount_paise: 45_000, entry_date: '2026-10-20' });
    await khataRepository.create({ kind: 'gave', party: 'Ravi', description: 'Loan', amount_paise: 100_000, entry_date: '2026-10-22' });
    const list = await khataRepository.list();
    expect(list.map((e) => e.entry_date)).toEqual(['2026-10-22', '2026-10-20']);
    const ops = await getDb().all<{ entity: string }>('SELECT entity FROM sync_queue');
    expect(ops.map((o) => o.entity)).toEqual(['khata_entries', 'khata_entries']);
    expect(await queue.listReady(getDb(), ['row'], 10)).toHaveLength(2);
  });

  it('totals a month by kind and filters by kind and search', async () => {
    await khataRepository.create({ kind: 'bought', description: 'Groceries', amount_paise: 45_000, entry_date: '2026-10-20' });
    await khataRepository.create({ kind: 'bought', description: 'Old item', amount_paise: 9_000, entry_date: '2026-09-30' });
    await khataRepository.create({ kind: 'got', party: 'Ravi', amount_paise: 20_000, entry_date: '2026-10-21' });
    expect(await khataRepository.totals({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ bought: 45_000, gave: 0, got: 20_000 });
    expect(await khataRepository.list({ kind: 'got' })).toHaveLength(1);
    expect((await khataRepository.list({ search: 'groc' })).map((e) => e.description)).toEqual(['Groceries']);
    expect(await khataRepository.list({ search: '100%' })).toHaveLength(0);
  });

  it('keeps a running balance per person, matching names case-insensitively', async () => {
    await khataRepository.create({ kind: 'gave', party: 'Ravi', amount_paise: 100_000, entry_date: '2026-10-01' });
    await khataRepository.create({ kind: 'got', party: 'ravi', amount_paise: 40_000, entry_date: '2026-10-05' });
    await khataRepository.create({ kind: 'got', party: 'Meena', amount_paise: 5_000, entry_date: '2026-10-03' });
    await khataRepository.create({ kind: 'bought', description: 'Milk', party: 'Ravi', amount_paise: 3_000, entry_date: '2026-10-06' });
    const balances = await khataRepository.balances();
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({ gave: 100_000, got: 40_000, net: 60_000, last_date: '2026-10-05' });
    expect(balances[1]).toMatchObject({ party: 'Meena', net: -5_000 });
  });

  it('updates and soft-deletes', async () => {
    const e = await khataRepository.create({ kind: 'gave', party: 'Ravi', amount_paise: 1_000, entry_date: '2026-10-01' });
    await khataRepository.update(e.id, { kind: 'gave', party: 'Ravi', amount_paise: 2_500, entry_date: '2026-10-02' });
    expect((await khataRepository.get(e.id))?.amount_paise).toBe(2_500);
    await khataRepository.remove(e.id);
    expect(await khataRepository.list()).toHaveLength(0);
    expect((await khataRepository.get(e.id))?.deleted_at).not.toBeNull();
  });

  it('rejects incomplete entries', async () => {
    await expect(khataRepository.create({ kind: 'bought', amount_paise: 100, entry_date: '2026-10-01' })).rejects.toThrow();
    await expect(khataRepository.create({ kind: 'gave', description: 'Rent', amount_paise: 100, entry_date: '2026-10-01' })).rejects.toThrow();
    await expect(khataRepository.create({ kind: 'got', party: 'Ravi', amount_paise: 0, entry_date: '2026-10-01' })).rejects.toThrow();
    await expect(khataRepository.create({ kind: 'got', party: 'Ravi', amount_paise: 10.5, entry_date: '2026-10-01' })).rejects.toThrow();
    await expect(khataRepository.create({ kind: 'got', party: 'Ravi', amount_paise: 100, entry_date: 'yesterday' })).rejects.toThrow();
  });
});
