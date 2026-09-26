import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

/** Apply standard resource tags required by CHR-18. */
export function applyStandardTags(
  scope: IConstruct,
  config: EnvironmentConfig,
): void {
  Tags.of(scope).add('project', 'gagnechris');
  Tags.of(scope).add('env', config.name);
  Tags.of(scope).add('managed-by', 'cdk');
}
