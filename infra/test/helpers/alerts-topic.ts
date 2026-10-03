import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { CfnTopic, Topic } from 'aws-cdk-lib/aws-sns';

/**
 * Exact `AlarmActions` for an alarm whose stack imports `topic` from another
 * stack, the way every app stack imports the Guardrails alerts topic (CHR-200).
 * Call it after `Template.fromStack(consumer)` so the cross-stack export
 * exists. It fails unless exactly one export of `topic`'s stack is `Ref` of
 * that topic, so an alarm wired to any other ARN no longer matches.
 */
export function alertsTopicAlarmActions(
  topic: Topic,
): [{ 'Fn::ImportValue': string }] {
  const owner = Stack.of(topic);
  const logicalId = owner.getLogicalId(topic.node.defaultChild as CfnTopic);
  const outputs = Template.fromStack(owner).findOutputs('*', {
    Value: { Ref: logicalId },
  });
  const exportNames = Object.values(outputs)
    .map((output) => (output as { Export?: { Name?: string } }).Export?.Name)
    .filter((name): name is string => typeof name === 'string');
  if (exportNames.length !== 1) {
    throw new Error(
      `Expected one export of ${logicalId} in ${owner.stackName}, found ${exportNames.length}`,
    );
  }
  return [{ 'Fn::ImportValue': exportNames[0]! }];
}
