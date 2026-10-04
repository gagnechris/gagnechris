import { hasPendingFlushes } from '@gagnechris/app-core';

export const unsavedBadge = () => (hasPendingFlushes() ? 'Unsaved' : '');
