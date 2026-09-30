/**
 * @deprecated Prefer `PublishableSingletonRepository` (CHR-152).
 */
export {
  PublishableSingletonRepository as SingletonRepository,
  nowIso,
  type PublishableEntity as VersionedSingleton,
  type PublishableSingletonConfig as SingletonRepositoryConfig,
} from './publishable-repository.js';
