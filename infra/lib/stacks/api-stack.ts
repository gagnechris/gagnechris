import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpStage,
  LogGroupLogDestination,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import {
  AllowedMethods,
  CachePolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: IUserPool;
  readonly webClient: IUserPoolClient;
  /** Optional second audience (iOS client). */
  readonly iosClient?: IUserPoolClient;
  readonly distribution: IDistribution;
  readonly alertsTopic: ITopic;
}

/**
 * HTTP API + Lambda behind CloudFront /api/* with Cognito JWT on admin routes.
 */
export class ApiStack extends Stack {
  readonly httpApi: HttpApi;
  readonly apiFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, userPool, webClient, distribution, alertsTopic } = props;

    const logGroup = new LogGroup(this, 'ApiLogGroup', {
      retention: RetentionDays.TWO_WEEKS,
    });

    this.apiFunction = new NodejsFunction(this, 'ApiFunction', {
      functionName: `gagnechris-${config.name}-api`,
      description: 'gagnechris HTTP API (health + admin)',
      entry: join(repoRoot, 'services/api/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      logGroup,
      depsLockFilePath: join(repoRoot, 'package-lock.json'),
      projectRoot: repoRoot,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        POWERTOOLS_SERVICE_NAME: 'gagnechris-api',
        POWERTOOLS_METRICS_NAMESPACE: 'gagnechris',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    NagSuppressions.addResourceSuppressions(
      this.apiFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'NodejsFunction uses AWSLambdaBasicExecutionRole for CloudWatch Logs.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'X-Ray tracing on the function role uses wildcard resources required by the managed tracing policy pattern.',
        },
      ],
      true,
    );

    const audiences = [webClient.userPoolClientId];
    if (props.iosClient) {
      audiences.push(props.iosClient.userPoolClientId);
    }

    const jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: audiences,
        identitySource: ['$request.header.Authorization'],
      },
    );

    const integration = new HttpLambdaIntegration(
      'ApiIntegration',
      this.apiFunction,
    );

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `gagnechris-${config.name}`,
      description: 'Blog CMS API (JWT on /api/admin/* and /api/notebook/*)',
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [
          `https://${APEX_DOMAIN}`,
          'http://localhost:5173',
          'http://localhost:3000',
        ],
        maxAge: Duration.days(1),
      },
      createDefaultStage: false,
    });

    const accessLogGroup = new LogGroup(this, 'HttpApiAccessLogs', {
      retention: RetentionDays.TWO_WEEKS,
    });

    new HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 20, burstLimit: 50 },
      accessLogSettings: {
        destination: new LogGroupLogDestination(accessLogGroup),
        format: AccessLogFormat.jsonWithStandardFields(),
      },
    });

    const healthRoutes = this.httpApi.addRoutes({
      path: '/api/health',
      methods: [HttpMethod.GET],
      integration,
    });
    NagSuppressions.addResourceSuppressions(
      healthRoutes,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'GET /api/health is intentionally public for uptime checks; admin and notebook routes require Cognito JWT.',
        },
      ],
      true,
    );

    this.httpApi.addRoutes({
      path: '/api/admin/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/admin',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/notebook/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/notebook',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });

    const apiDomain = `${this.httpApi.apiId}.execute-api.${Stack.of(this).region}.amazonaws.com`;
    distribution.addBehavior(
      '/api/*',
      new HttpOrigin(apiDomain, {
        readTimeout: Duration.seconds(30),
      }),
      {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
    );

    new Alarm(this, 'ApiLambdaErrors', {
      alarmName: `gagnechris-${config.name}-api-lambda-errors`,
      alarmDescription: 'API Lambda errors > 0 in 5 minutes',
      metric: this.apiFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(alertsTopic));

    const paramPrefix = `/gagnechris/${config.name}`;
    new StringParameter(this, 'HttpApiIdParam', {
      parameterName: `${paramPrefix}/http-api-id`,
      stringValue: this.httpApi.apiId,
      description: 'API Gateway HTTP API ID',
    });
    new StringParameter(this, 'HttpApiUrlParam', {
      parameterName: `${paramPrefix}/http-api-url`,
      stringValue: this.httpApi.apiEndpoint,
      description: 'API Gateway HTTP API endpoint (direct)',
    });

    new CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description:
        'Direct HTTP API URL (prefer https://gagnechris.com/api/... via CloudFront)',
    });
    new CfnOutput(this, 'HealthUrl', {
      value: `https://${APEX_DOMAIN}/api/health`,
      description: 'Same-origin health check',
    });
  }
}
