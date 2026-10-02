import {
  ArnFormat,
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import {
  CfnStage,
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpStage,
  LogGroupLogDestination,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import type { IEmailIdentity } from 'aws-cdk-lib/aws-ses';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import { join } from 'node:path';
import { API_LAMBDA_TIMEOUT_MS } from '@gagnechris/data';
import {
  API_SERVICE_NAME,
  siteOrigins,
  ssmParameterName,
} from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { emfServiceAlarm, metricAlarm } from '../constructs/emf-alarm.js';
import { NodeLambda, REPO_ROOT } from '../constructs/node-lambda.js';

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: IUserPool;
  readonly webClient: IUserPoolClient;
  /** Optional second audience (iOS client). */
  readonly iosClient?: IUserPoolClient;
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
      alertsTopic,
      dataTable,
      emailIdentity,
      notifyEmailIdentity,
      fromEmail,
    } = props;

    // Site bucket name via SSM (Site writes it; avoids Site↔Api CFN exports).
    const siteBucketName = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'siteBucketName'),
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
      timeout: Duration.millis(API_LAMBDA_TIMEOUT_MS),
      powertoolsServiceName: API_SERVICE_NAME,
      alertsTopic,
      alarmNamePrefix: `gagnechris-${config.name}-api`,
      iam5NagReason:
        'X-Ray tracing wildcards, DynamoDB index/*, scoped s3:PutObject on media/*, and SES send on the domain identity (CHR-31 / CHR-38).',
      iam5NagAppliesTo: [
        'Resource::*',
        'Action::s3:Abort*',
        { regex: '/^Resource::.*/index*/g' },
        { regex: '/^Resource::arn:<AWS::Partition>:s3:::.*/media/*/g' },
      ],
      environment: {
        DATA_TABLE_NAME: dataTable.tableName,
        SITE_BUCKET_NAME: siteBucketName,
        CONTACT_TO_EMAIL: config.alertsEmail,
        CONTACT_FROM_EMAIL: fromEmail,
        SITE_APEX_DOMAIN: config.domainName,
      },
    });

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
        // API Gateway stores AllowHeaders lowercase; keep template aligned
        // to avoid nightly drift (CHR-149).
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: siteOrigins(config.domainName),
        maxAge: Duration.days(1),
      },
      createDefaultStage: false,
    });

    const accessLogGroup = new LogGroup(this, 'HttpApiAccessLogs', {
      retention: RetentionDays.TWO_WEEKS,
    });

    const defaultStage = new HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 20, burstLimit: 50 },
      accessLogSettings: {
        destination: new LogGroupLogDestination(accessLogGroup),
        format: AccessLogFormat.jsonWithStandardFields(),
      },
    });
    // API Gateway stores DestinationArn without the `:*` suffix. LogGroup
    // AttrArn always ends in `:*`, so build the ARN without it (CHR-159).
    const cfnStage = defaultStage.node.defaultChild as CfnStage;
    cfnStage.addPropertyOverride(
      'AccessLogSettings.DestinationArn',
      Stack.of(this).formatArn({
        service: 'logs',
        resource: 'log-group',
        resourceName: accessLogGroup.logGroupName,
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      }),
    );

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

    // /api/* CloudFront behavior lives in SiteStack (SSM http-api-id).

    // Handled 500s never increment Lambda Errors — alarm on EMF instead (CHR-168).
    emfServiceAlarm(this, 'ApiHandlerErrors', {
      alarmName: `gagnechris-${config.name}-api-handler-errors`,
      alarmDescription:
        'API handler returned a handled 500 (uncaught route/handler error)',
      serviceName: API_SERVICE_NAME,
      metricName: 'HandlerError',
      alertsTopic,
    });
    emfServiceAlarm(this, 'ApiDataIntegrityErrors', {
      alarmName: `gagnechris-${config.name}-api-data-integrity`,
      alarmDescription: 'API hit a corrupt DynamoDB row (data_integrity 500)',
      serviceName: API_SERVICE_NAME,
      metricName: 'DataIntegrityError',
      alertsTopic,
    });
    metricAlarm(this, 'ApiGateway5xx', {
      alarmName: `gagnechris-${config.name}-api-gateway-5xx`,
      alarmDescription: 'API Gateway HTTP API 5XX responses ≥ 1 in 5 minutes',
      metric: this.httpApi.metricServerError({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      alertsTopic,
    });

    new StringParameter(this, 'HttpApiIdParam', {
      parameterName: ssmParameterName(config.name, 'httpApiId'),
      stringValue: this.httpApi.apiId,
      description: 'API Gateway HTTP API ID',
    });
    new StringParameter(this, 'HttpApiUrlParam', {
      parameterName: ssmParameterName(config.name, 'httpApiUrl'),
      stringValue: this.httpApi.apiEndpoint,
      description: 'API Gateway HTTP API endpoint (direct)',
    });

    new CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description:
        'Direct HTTP API URL (prefer https://gagnechris.com/api/... via CloudFront)',
    });
    new CfnOutput(this, 'HealthUrl', {
      value: `https://${config.domainName}/api/health`,
      description: 'Same-origin health check',
    });
  }
}
