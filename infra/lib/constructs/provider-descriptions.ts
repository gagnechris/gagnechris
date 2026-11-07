import { CfnResource, Stack } from 'aws-cdk-lib';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { AwsCustomResource } from 'aws-cdk-lib/custom-resources';
import type { IConstruct } from 'constructs';

// Renaming these handlers would change the custom resources' ServiceToken,
// which CloudFormation refuses to update; a description is the only label
// that can be added in place.

/** Labels the stack's AwsCustomResource singleton handler in the Lambda console. */
export function describeAwsCustomResourceHandler(
  scope: IConstruct,
  purpose: string,
): void {
  const stack = Stack.of(scope);
  const id = `AWS${AwsCustomResource.PROVIDER_FUNCTION_UUID.replaceAll('-', '')}`;
  const fn = stack.node.tryFindChild(id)?.node.defaultChild;
  if (!(fn instanceof CfnFunction)) {
    throw new Error(`${stack.stackName} has no AwsCustomResource handler`);
  }
  fn.description = handlerDescription(stack, 'AwsCustomResource', purpose);
}

/** Labels the handler behind the OpenIdConnectProvider L2 in the Lambda console. */
export function describeOpenIdConnectProviderHandler(scope: IConstruct): void {
  const stack = Stack.of(scope);
  const handler = stack.node
    .tryFindChild('Custom::AWSCDKOpenIdConnectProviderCustomResourceProvider')
    ?.node.tryFindChild('Handler');
  if (!(handler instanceof CfnResource)) {
    throw new Error(`${stack.stackName} has no OpenIdConnectProvider handler`);
  }
  handler.addPropertyOverride(
    'Description',
    handlerDescription(
      stack,
      'OpenIdConnectProvider',
      'creates and updates the GitHub Actions OIDC identity provider',
    ),
  );
}

function handlerDescription(
  stack: Stack,
  construct: string,
  purpose: string,
): string {
  const text = `${stack.stackName} CDK ${construct} handler: ${purpose}.`;
  if (text.length > 256) {
    throw new Error(`Lambda description over 256 characters: ${text}`);
  }
  return text;
}
