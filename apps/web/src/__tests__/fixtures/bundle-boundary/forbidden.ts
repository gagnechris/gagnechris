import { createUlid } from '../../../lib/ulid';

export const id = createUlid();
export const load = () => import('../../../workspace/api/apiTarget');
