import type { TextStyle } from 'react-native';

import { AppText } from './AppText';

/** "Crafted by" line shown on the splash, auth screens and profile. */
export function Credit({ style }: { style?: TextStyle }) {
  return (
    <AppText variant="caption" color="textSubtle" align="center" style={style}>
      Crafted with ❤️ by Wynex Technologies
    </AppText>
  );
}
