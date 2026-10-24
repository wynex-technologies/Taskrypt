import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { TextField } from './TextField';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  helper?: string;
  icon?: LucideIcon;
  secure?: boolean;
};

/** TextField bound to react-hook-form with zod-driven error messages. */
export function FormField<T extends FieldValues>({ control, name, ...rest }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <TextField ref={ref} value={value == null ? '' : String(value)} onChangeText={onChange} onBlur={onBlur} error={error?.message} {...rest} />
      )}
    />
  );
}
