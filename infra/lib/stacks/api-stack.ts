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
import { Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import { join } from 'node:path';
import type { Construct } from 'constructs';
import { API_LAMBDA_TIMEOUT_MS } from '@gagnechris/data';
import {
  API_SERVICE_NAME,
  LEGACY_WEB_AUTH,
  POWERTOOLS_METRICS_NAMESPACE,
  siteOrigins,
  ssmParameterName,
} from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { emfServiceAlarm, metricAlarm } from '../constructs/emf-alarm.js';
import { NodeLambda, REPO_ROOT } from '../constructs/node-lambda.js';

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: IUserPool;
  /** Legacy apex client; trusted on both prefixes only while `legacyWebAuth`. */
  readonly webClient: IUserPoolClient;
  /** Defaults to LEGACY_WEB_AUTH. */
  readonly legacyWebAuth?: boolean;
  readonly alertsTopic: ITopic;
  readonly dataTable: ITable;
  readonly emailIdentity: IEmailIdentity;
  /** Required in the SES sandbox: SendEmail also authorizes the destination identity. */
  readonly notifyEmailIdentity: IEmailIdentity;
  readonly fromEmail: string;
}

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

    const legacyWebAuth = props.legacyWebAuth ?? LEGACY_WEB_AUTH;
    const legacyWebClientIds = legacyWebAuth
      ? [webClient.userPoolClientId]
      : [];
    // Via SSM, not Auth exports, so Auth can replace or drop a client without
    // first removing an import here. Auth deploys before Api.
    const adminWebClientId = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'cognitoAdminWebClientId'),
    );
    const notebookWebClientId = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'cognitoNotebookWebClientId'),
    );

    // Via SSM to avoid Site↔Api CFN exports.
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
        'X-Ray tracing wildcards, DynamoDB index/*, scoped s3:PutObject on media/*, and SES send on the domain identity.',
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
        ADMIN_WEB_CLIENT_ID: adminWebClientId,
        NOTEBOOK_WEB_CLIENT_ID: notebookWebClientId,
        ...(legacyWebAuth
          ? { AUTH_LEGACY_WEB_CLIENT_ID: webClient.userPoolClientId }
          : {}),
      },
    });

    dataTable.grantReadWriteData(this.apiFunction);
    // Presigned PUT only; objects are read via CloudFront OAC.
    siteBucket.grantPut(this.apiFunction, 'media/*');
    emailIdentity.grantSendEmail(this.apiFunction);
    notifyEmailIdentity.grantSendEmail(this.apiFunction);

    // One authorizer per prefix so a token from the other app's client gets a
    // gateway 401. The iOS client (custom-scheme callback) stays out of both
    // audiences until the app ships with universal links.
    const issuer = `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`;
    const adminAuthorizer = new HttpJwtAuthorizer('CognitoJwtAdmin', issuer, {
      jwtAudience: [adminWebClientId, ...legacyWebClientIds],
      identitySource: ['$request.header.Authorization'],
    });
    const notebookAuthorizer = new HttpJwtAuthorizer(
      'CognitoJwtNotebook',
      issuer,
      {
        jwtAudience: [notebookWebClientId, ...legacyWebClientIds],
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
        // API Gateway stores these lowercase; anything else shows as drift.
        allowHeaders: ['authorization', 'content-type', 'if-match'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: siteOrigins(config.domainName),
        exposeHeaders: ['etag'],
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
    // API Gateway stores DestinationArn without the `:*` suffix that LogGroup
    // AttrArn always has, so the template would drift.
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
    // Notebook sync gets a higher ceiling so a contact spike is less likely
    // to starve offline catch-up. Gateway 429 bodies are `{"message":…}`, not
    // ErrorResponse.
    cfnStage.addPropertyOverride('RouteSettings', {
      'ANY /api/notebook/{proxy+}': {
        ThrottlingRateLimit: 50,
        ThrottlingBurstLimit: 100,
      },
      'ANY /api/notebook': {
        ThrottlingRateLimit: 50,
        ThrottlingBurstLimit: 100,
      },
      'POST /api/contact': {
        ThrottlingRateLimit: 5,
        ThrottlingBurstLimit: 10,
      },
      'POST /api/resume/download': {
        ThrottlingRateLimit: 5,
        ThrottlingBurstLimit: 10,
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
            'POST /api/contact is public (contact form); spam mitigated by honeypot, per-IP DynamoDB rate limits, and API stage throttle.',
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
            'POST /api/resume/download is a public anonymous notify ping; no PII; IP/day dedupe + SES daily cap + stage throttle.',
        },
      ],
      true,
    );

    this.httpApi.addRoutes({
      path: '/api/admin/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: adminAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/admin',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: adminAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/notebook/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: notebookAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/api/notebook',
      methods: [HttpMethod.ANY],
      integration,
      authorizer: notebookAuthorizer,
    });

    // Handled 500s never increment Lambda Errors, so alarm on EMF.
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
    emfServiceAlarm(this, 'ApiSyncAdapterMissing', {
      alarmName: `gagnechris-${config.name}-api-sync-adapter-missing`,
      alarmDescription:
        'Sync feed hit a change type with no registered adapter (500)',
      serviceName: API_SERVICE_NAME,
      metricName: 'SyncAdapterMissing',
      alertsTopic,
    });
    // Notebook ops: a burst of 409/412s means autosave or sync is fighting
    // itself (two devices, or a client bug), not a single stale tab.
    metricAlarm(this, 'ApiWriteConflictSpike', {
      alarmName: `gagnechris-${config.name}-api-write-conflict-spike`,
      alarmDescription: 'API 409/412 write conflicts ≥ 20 in 15 minutes',
      metric: new Metric({
        namespace: POWERTOOLS_METRICS_NAMESPACE,
        metricName: 'WriteConflict',
        dimensionsMap: { service: API_SERVICE_NAME },
        statistic: 'Sum',
        period: Duration.minutes(15),
      }),
      threshold: 20,
      alertsTopic,
    });
    metricAlarm(this, 'ApiLatencyP95', {
      alarmName: `gagnechris-${config.name}-api-latency-p95`,
      alarmDescription: 'API Gateway p95 latency ≥ 3 s for 15 minutes',
      metric: this.httpApi.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p95',
      }),
      threshold: 3000,
      evaluationPeriods: 3,
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
