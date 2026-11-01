import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export function standardTags(
  config: EnvironmentConfig,
): Array<{ Key: string; Value: string }> {
  return [
    { Key: 'project', Value: 'gagnechris' },
    { Key: 'env', Value: config.name },
    { Key: 'managed-by', Value: 'cdk' },
  ];
}

export function applyStandardTags(
  scope: IConstruct,
  config: EnvironmentConfig,
): void {
  for (const { Key, Value } of standardTags(config)) {
    Tags.of(scope).add(Key, Value);
  }
}
