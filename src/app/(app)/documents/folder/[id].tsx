import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Screen } from '@/components';
import { VaultBrowser } from '@/features/documents/components/VaultBrowser';
import { BackBar } from '@/features/documents/components/BackBar';
import { useFolderPath } from '@/hooks/queries';
import { isUuid } from '@/lib/ids';
import { useTheme } from '@/theme';

export default function FolderScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const path = useFolderPath(isUuid(id) ? id : null);

  if (!isUuid(id) || (path.isFetched && (path.data?.length ?? 0) === 0))
    return (
      <Screen back>
        <EmptyState title="Folder not found" body="It may have been deleted or moved on another device." mood="error" />
      </Screen>
    );

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
      <BackBar />
      <VaultBrowser folderId={id} />
    </View>
  );
}
