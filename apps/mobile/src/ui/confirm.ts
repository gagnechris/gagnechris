import type { ConfirmFn } from '@gagnechris/app-core';
import { Alert } from 'react-native';

/** A two-button alert; resolves true on the action, false on Cancel. */
export const confirmAction = (
  title: string,
  message: string,
  action: string,
  destructive = true,
): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: action,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

/** app-core's confirm for editor prompts (leave without saving, delete). */
export const nativeConfirm: ConfirmFn = (message) =>
  confirmAction(message, '', 'OK');

export const showError = (title: string, message: string) =>
  Alert.alert(title, message);
