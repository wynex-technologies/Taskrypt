import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { View } from 'react-native';

import { IconButton } from '@/components';

export function BackBar() {
  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 4 }}>
      <IconButton icon={ChevronLeft} label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/documents'))} />
    </View>
  );
}
