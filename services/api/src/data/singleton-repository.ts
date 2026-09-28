/**
 * @deprecated Prefer `PublishableSingletonRepository` (CHR-129).
 * Kept as a stable alias for Home/Resume repositories.
 */
export {
  PublishableSingletonRepository as SingletonRepository,
  nowIso,
  type PublishableEntity as VersionedSingleton,
  type PublishableRepositoryConfig as SingletonRepositoryConfig,
} from './publishable-repository.js';
