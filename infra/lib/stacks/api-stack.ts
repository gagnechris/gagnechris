import {
  CfnOutput,
  CfnResource,
  Duration,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
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
  AllowedMethods,
  CachePolicy,
  type Distribution,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import type { IEmailIdentity } from 'aws-cdk-lib/aws-ses';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import { join } from 'node:path';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { NodeLambda, REPO_ROOT } from '../constructs/node-lambda.js';
import { APEX_DOMAIN } from './dns-stack.js';

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: IUserPool;
  readonly webClient: IUserPoolClient;
  /** Optional second audience (iOS client). */
  readonly iosClient?: IUserPoolClient;
  readonly distribution: Distribution;
  readonly alertsTopic: ITopic;
  /** Shared single-table (posts + future Notebook). */
  readonly dataTable: ITable;
  /** SES domain identity for contact / resume notifications (CHR-38). */
  readonly emailIdentity: IEmailIdentity;
  /**
   * SES identity for the notify inbox. Required in sandbox because SendEmail
   * authorizes the destination identity as well as the From domain.
   */
  readonly notifyEmailIdentity: IEmailIdentity;
  /** Verified From address (e.g. noreply@apex). */
  readonly fromEmail: string;
}

/**
 * HTTP API + Lambda behind CloudFront /api/* with Cognito JWT on admin routes.
 */
export class ApiStack extends Stack {
  readonly httpApi: HttpApi;
  readonly apiFunction: NodeLambda;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const {
      config,
      userPool,
      webClient,
      distribution,
      alertsTopic,
      dataTable,
      emailIdentity,
      notifyEmailIdentity,
      fromEmail,
    } = props;

    // SSM late-binding avoids Site ↔ Api cycle (Api adds /api/* on Site's
    // distribution; Site would otherwise export the bucket into Api).
    const siteBucketName = StringParameter.valueForStringParameter(
      this,
      `/gagnechris/${config.name}/site-bucket-name`,
    );
    const siteBucket = Bucket.fromBucketName(
      this,
      'SiteBucketForMedia',
      siteBucketName,
    );

    this.apiFunction = new NodeLambda(this, 'ApiFunction', {
      functionName: `gagnechris-${config.name}-api`,
      description:
        'gagnechris HTTP API (health, contact, admin posts/media; shared data table)',
      entry: join(REPO_ROOT, 'services/api/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      powertoolsServiceName: 'gagnechris-api',
      alertsTopic,
      alarmNamePrefix: `gagnechris-${config.name}-api`,
      // Keep legacy stack-level ApiLambdaErrors resource (CHR-134 migration).
      createErrorsAlarm: false,
      iam5NagReason:
        'X-Ray tracing wildcards, scoped s3:PutObject on media/*, and SES send on the domain identity (CHR-31 / CHR-38).',
      environment: {
        DATA_TABLE_NAME: dataTable.tableName,
        SITE_BUCKET_NAME: siteBucketName,
        CONTACT_TO_EMAIL: config.alertsEmail,
        CONTACT_FROM_EMAIL: fromEmail,
        SITE_APEX_DOMAIN: APEX_DOMAIN,
      },
    });

    const apiErrorsAlarm = new Alarm(this, 'ApiLambdaErrors', {
      alarmName: `gagnechris-${config.name}-api-lambda-errors`,
      alarmDescription: 'API Lambda Errors > 0',
      metric: this.apiFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    (apiErrorsAlarm.node.defaultChild as CfnResource).overrideLogicalId(
      'ApiLambdaErrors',
    );
    apiErrorsAlarm.addAlarmAction(new SnsAction(alertsTopic));

    dataTable.grantReadWriteData(this.apiFunction);
    // Presigned PUT only — objects are read via CloudFront OAC.
    siteBucket.grantPut(this.apiFunction, 'media/*');
    emailIdentity.grantSendEmail(this.apiFunction);
    // Sandbox SendEmail also checks the destination identity ARN.
    notifyEmailIdentity.grantSendEmail(this.apiFunction);

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

    const contactRoutes = this.httpApi.addRoutes({
      path: '/api/contact',
      methods: [HttpMethod.POST],
      integration,
    });
    NagSuppressions.addResourceSuppressions(
      contactRoutes,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'POST /api/contact is public (contact form); spam mitigated by honeypot, per-IP DynamoDB rate limits, and API stage throttle (CHR-98).',
        },
      ],
      true,
    );

    const resumeNotifyRoutes = this.httpApi.addRoutes({
      path: '/api/resume/download',
      methods: [HttpMethod.POST],
      integration,
    });
    NagSuppressions.addResourceSuppressions(
      resumeNotifyRoutes,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'POST /api/resume/download is a public anonymous notify ping; no PII; IP/day dedupe + SES daily cap + stage throttle (CHR-98).',
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
