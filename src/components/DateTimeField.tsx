import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { formatDate, formatTime } from '@/lib/time';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { Chip } from './Chip';
import { Sheet } from './Sheet';

type Props = { value: Date; onChange: (d: Date) => void; showTime: boolean };

/** Native date + time pickers (Android dialogs, iOS inline in a sheet). */
export function DateTimeField({ value, onChange, showTime }: Props) {
  const theme = useTheme();
  const [iosMode, setIosMode] = useState<'date' | 'time' | null>(null);

  const open = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: undefined,
        onChange: (e, d) => {
          if (e.type === 'set' && d) onChange(d);
        },
      });
    } else setIosMode(mode);
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Chip icon={CalendarDays} label={formatDate(value)} onPress={() => open('date')} />
      {showTime ? <Chip icon={Clock} label={formatTime(value)} onPress={() => open('time')} /> : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={iosMode !== null} onClose={() => setIosMode(null)} title={iosMode === 'time' ? 'Time' : 'Date'}>
          {iosMode ? (
            <RNDateTimePicker
              value={value}
              mode={iosMode}
              display={iosMode === 'date' ? 'inline' : 'spinner'}
              themeVariant={theme.scheme}
              accentColor={theme.colors.primary}
              onChange={(_, d) => d && onChange(d)}
            />
          ) : null}
          <Button label="Done" onPress={() => setIosMode(null)} fullWidth />
        </Sheet>
      ) : null}
    </View>
  );
}
