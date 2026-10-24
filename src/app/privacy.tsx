import { View } from 'react-native';

import { AppText, Card, Screen } from '@/components';
import { useTheme } from '@/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we store',
    body: 'Your account e-mail and display name; the tasks, lists, tags, categories, folders and document details you create; and the document files you upload. We do not sell data, show ads or use third-party analytics.',
  },
  {
    title: 'Where it lives',
    body: 'In your Supabase project (PostgreSQL and private Storage). Every row and file is protected by row-level security so only your account can read or change it. Files are never available through public links; viewing uses short-lived signed URLs.',
  },
  {
    title: 'On your device',
    body: 'Tasks and document details are kept in a private on-device database so the app works offline. Downloaded documents are encrypted with AES-256-GCM using a key held in the iOS Keychain or Android Keystore. Device backups exclude this data.',
  },
  {
    title: 'Zero-knowledge option',
    body: 'If you enable the vault passphrase, documents are encrypted before upload and our servers never receive the key. Losing the passphrase means those documents cannot be recovered.',
  },
  {
    title: 'Retention and deletion',
    body: 'Deleted items are kept as tombstones for up to 60 days so every device can learn about the deletion, then removed permanently. Deleting your account immediately removes your profile, all rows and all stored files. Signing out removes local data from the device by default.',
  },
  {
    title: 'Reminders',
    body: 'Reminders are scheduled locally by your phone. Task titles appear in notifications; Android hides them on a secure lock screen.',
  },
  {
    title: 'Contact',
    body: 'Questions or data requests: replace this text with your support address before publishing the app.',
  },
];

export default function Privacy() {
  const theme = useTheme();
  return (
    <Screen title="Privacy & data" subtitle="Plain-language summary. Have counsel review before release." back>
      <View style={{ gap: theme.spacing.md }}>
        {SECTIONS.map((s) => (
          <Card key={s.title} style={{ gap: 6 }}>
            <AppText variant="subheading">{s.title}</AppText>
            <AppText color="textMuted">{s.body}</AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
