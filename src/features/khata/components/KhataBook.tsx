import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search, ShoppingBag, Trash2, X, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Chip, ChipRow, CONTENT_MAX_WIDTH, EmptyState, ErrorState, Fab, IconButton, ScalePressable, Segmented, Sheet, SkeletonList, TextField, toast } from '@/components';
import { DateTimeField } from '@/components/DateTimeField';
import { requestSync } from '@/features/sync/syncService';
import { useKhataBalances, useKhataEntries, useKhataTotals } from '@/hooks/queries';
import { addMonths, dayKey, formatDate, formatMonth } from '@/lib/time';
import { formatAmount, khataRepository, parseAmount, type PartyBalance } from '@/repositories/khataRepository';
import { useTheme } from '@/theme';
import type { KhataKind, LocalKhataEntry } from '@/types/domain';

const KINDS: { value: KhataKind; label: string; icon: LucideIcon }[] = [
  { value: 'bought', label: 'Bought', icon: ShoppingBag },
  { value: 'gave', label: 'Gave', icon: ArrowUpRight },
  { value: 'got', label: 'Got', icon: ArrowDownLeft },
];
const KIND_ICON = Object.fromEntries(KINDS.map((k) => [k.value, k.icon])) as Record<KhataKind, LucideIcon>;

type Form = { id?: string; kind: KhataKind; amount: string; party: string; description: string; date: Date };

const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

const monthBounds = (month: Date) => ({ from: dayKey(new Date(month.getFullYear(), month.getMonth(), 1)), to: dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)) });

function useKindColors() {
  const { colors } = useTheme();
  return {
    bought: { fg: colors.text, bg: colors.surfaceSunken, sign: '-' },
    gave: { fg: colors.danger, bg: colors.dangerSoft, sign: '-' },
    got: { fg: colors.success, bg: colors.successSoft, sign: '+' },
  } as const;
}

function Total({ label, value, color }: { label: string; value: number; color: 'text' | 'danger' | 'success' }) {
  const theme = useTheme();
  return (
    <View style={[styles.total, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={color} numberOfLines={1} adjustsFontSizeToFit>
        {formatAmount(value)}
      </AppText>
    </View>
  );
}

function BalanceCard({ b, onPress }: { b: PartyBalance; onPress: () => void }) {
  const theme = useTheme();
  const label = b.net > 0 ? 'You will get' : b.net < 0 ? 'You will give' : 'Settled';
  const color = b.net > 0 ? 'success' : b.net < 0 ? 'danger' : 'textMuted';
  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${b.party}. ${label}${b.net ? ` ${formatAmount(Math.abs(b.net))}` : ''}`}
      style={[styles.balance, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
    >
      <AppText variant="bodyStrong" numberOfLines={1}>
        {b.party}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      {b.net ? (
        <AppText variant="bodyStrong" color={color}>
          {formatAmount(Math.abs(b.net))}
        </AppText>
      ) : null}
    </ScalePressable>
  );
}

function EntryRow({ e, onPress }: { e: LocalKhataEntry; onPress: () => void }) {
  const theme = useTheme();
  const tone = useKindColors()[e.kind];
  const Icon = KIND_ICON[e.kind];
  const main = e.kind === 'bought' ? e.description : e.party;
  const sub = [e.kind === 'bought' ? e.party : e.description, formatDate(parseDay(e.entry_date))].filter(Boolean).join(' · ');
  const verb = e.kind === 'bought' ? 'Bought' : e.kind === 'gave' ? 'Paid to' : 'Received from';
  return (
    <ScalePressable onPress={onPress} pressedScale={0.99} accessibilityRole="button" accessibilityLabel={`${verb} ${main}, ${formatAmount(e.amount_paise)}, ${sub}`} style={styles.entry}>
      <View style={[styles.entryIcon, { backgroundColor: tone.bg, borderRadius: theme.radii.sm }]}>
        <Icon size={18} color={tone.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {main}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {sub}
        </AppText>
      </View>
      <AppText variant="bodyStrong" style={{ color: tone.fg }}>
        {tone.sign}
        {formatAmount(e.amount_paise)}
      </AppText>
    </ScalePressable>
  );
}

function EntrySheet({ form, onChange, onClose }: { form: Form | null; onChange: (f: Form) => void; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  if (!form) return null;
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const amount = parseAmount(form.amount);
  const primary = form.kind === 'bought' ? form.description : form.party;
  const canSave = amount !== null && primary.trim().length > 0;

  const save = async () => {
    if (amount === null) return;
    setSaving(true);
    try {
      const input = { kind: form.kind, amount_paise: amount, party: form.party, description: form.description, entry_date: dayKey(form.date) };
      if (form.id) await khataRepository.update(form.id, input);
      else await khataRepository.create(input);
      requestSync('khata');
      toast.success(form.id ? 'Entry updated' : 'Entry added');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete entry?', 'It will be removed from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          khataRepository
            .remove(form.id!)
            .then(() => {
              requestSync('khata');
              toast.success('Entry deleted');
              onClose();
            })
            .catch(toast.error);
        },
      },
    ]);

  return (
    <Sheet visible onClose={onClose} title={form.id ? 'Edit entry' : 'New entry'}>
      <Segmented<KhataKind> accessibilityLabel="Entry type" value={form.kind} onChange={(kind) => set({ kind })} options={KINDS.map(({ value, label }) => ({ value, label }))} />
      <TextField label="Amount (₹)" placeholder="0" value={form.amount} onChangeText={(amount) => set({ amount })} keyboardType="decimal-pad" autoFocus={!form.id} error={form.amount && amount === null ? 'Enter a valid amount, like 250 or 99.50' : undefined} />
      {form.kind === 'bought' ? (
        <>
          <TextField label="What did you buy?" placeholder="e.g. Groceries, phone recharge" value={form.description} onChangeText={(description) => set({ description })} maxLength={200} />
          <TextField label="From (optional)" placeholder="Shop or seller" value={form.party} onChangeText={(party) => set({ party })} maxLength={80} />
        </>
      ) : (
        <>
          <TextField label={form.kind === 'gave' ? 'Paid to' : 'Received from'} placeholder="Name" value={form.party} onChangeText={(party) => set({ party })} maxLength={80} />
          <TextField label="For what? (optional)" placeholder="e.g. Rent, loan, dinner" value={form.description} onChangeText={(description) => set({ description })} maxLength={200} />
        </>
      )}
      <DateTimeField value={form.date} onChange={(date) => set({ date })} showTime={false} />
      <Button label="Save" fullWidth loading={saving} disabled={!canSave} onPress={save} />
      {form.id ? <Button label="Delete entry" icon={Trash2} variant="ghost" fullWidth onPress={remove} /> : null}
    </Sheet>
  );
}

export function KhataBook({ tabs }: { tabs: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [kind, setKind] = useState<KhataKind | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  const { from, to } = monthBounds(month);
  const searching = search.trim().length > 0;
  const filter = useMemo(() => (searching ? { kind: kind ?? undefined, search } : { kind: kind ?? undefined, from, to }), [searching, kind, search, from, to]);
  const entries = useKhataEntries(filter);
  const totals = useKhataTotals(from, to);
  const balances = useKhataBalances();
  const people = balances.data ?? [];
  const thisMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  const openNew = () => setForm({ kind: kind ?? 'bought', amount: '', party: '', description: '', date: thisMonth ? new Date() : month });
  const openEdit = (e: LocalKhataEntry) =>
    setForm({ id: e.id, kind: e.kind, amount: String(e.amount_paise / 100), party: e.party ?? '', description: e.description ?? '', date: parseDay(e.entry_date) });

  const header = (
    <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppText variant="title" accessibilityRole="header">
            Vault
          </AppText>
          <AppText variant="caption" color="textMuted">
            Khata Book: what you spent, gave and got
          </AppText>
        </View>
        <IconButton
          icon={searchOpen ? X : Search}
          label={searchOpen ? 'Close search' : 'Search khata'}
          onPress={() => {
            setSearchOpen((o) => !o);
            setSearch('');
          }}
        />
      </View>
      {tabs}
      {searchOpen ? <TextField icon={Search} placeholder="Search by name or item" value={search} onChangeText={setSearch} autoFocus returnKeyType="search" accessibilityLabel="Search khata" /> : null}

      {!searching ? (
        <>
          <View style={styles.row}>
            <IconButton icon={ChevronLeft} label="Previous month" onPress={() => setMonth((m) => addMonths(m, -1))} />
            <AppText variant="heading" align="center" style={{ flex: 1 }}>
              {formatMonth(month)}
            </AppText>
            <IconButton icon={ChevronRight} label="Next month" onPress={() => setMonth((m) => addMonths(m, 1))} disabled={thisMonth} />
          </View>
          <View style={styles.row}>
            <Total label="Spent" value={totals.data?.bought ?? 0} color="text" />
            <Total label="Gave" value={totals.data?.gave ?? 0} color="danger" />
            <Total label="Got" value={totals.data?.got ?? 0} color="success" />
          </View>
        </>
      ) : null}

      {!searching && people.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="overline" color="textMuted">
            People
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {people.map((b) => (
              <BalanceCard
                key={b.party.toLowerCase()}
                b={b}
                onPress={() => {
                  setSearchOpen(true);
                  setSearch(b.party);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ChipRow>
        <Chip label="All" selected={kind === null} onPress={() => setKind(null)} />
        {KINDS.map((k) => (
          <Chip key={k.value} label={k.label} icon={k.icon} selected={kind === k.value} onPress={() => setKind(kind === k.value ? null : k.value)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <FlatList
        data={entries.data ?? []}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 140, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginLeft: 52 }} />}
        renderItem={({ item }) => <EntryRow e={item} onPress={() => openEdit(item)} />}
        ListEmptyComponent={
          entries.isLoading ? (
            <SkeletonList />
          ) : entries.error ? (
            <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />
          ) : searching || kind ? (
            <EmptyState title="No matching entries" body={searching ? 'Try another name or item.' : 'Nothing of this type this month.'} mood="idle" compact />
          ) : (
            <EmptyState
              title={thisMonth ? 'Your khata is empty' : 'No entries this month'}
              body="Note what you buy, who you pay and who pays you. Totals and balances add up for you."
              mood="empty"
              actionLabel="Add an entry"
              onAction={openNew}
            />
          )
        }
      />
      <Fab icon={Plus} label="Add khata entry" onPress={openNew} bottomOffset={8} />
      <EntrySheet form={form} onChange={setForm} onClose={() => setForm(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  total: { flex: 1, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  balance: { width: 150, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  entryIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
