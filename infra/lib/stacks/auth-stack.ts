import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  CfnUserPoolGroup,
  CfnUserPoolUserToGroupAttachment,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  PasskeyUserVerification,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  type IHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { UserPoolDomainTarget } from 'aws-cdk-lib/aws-route53-targets';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import {
  ADMIN_HOST,
  APEX_DOMAIN,
  AUTH_DOMAIN as AUTH_DOMAIN_CONST,
  DEV_ADMIN_ORIGIN,
  DEV_NOTEBOOK_ORIGIN,
  DEV_ORIGIN,
  NOTEBOOK_GROUP,
  NOTEBOOK_HOST,
  SITE_ADMIN_GROUP,
  ssmParameterName,
  USER_ADMIN_GROUP,
} from '../config/constants.js';

export const AUTH_DOMAIN = AUTH_DOMAIN_CONST;

export interface AuthStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly certificate: ICertificate;
  /** Tests only. */
  readonly hostedZone?: IHostedZone;
}

export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly adminWebClient: UserPoolClient;
  readonly notebookWebClient: UserPoolClient;
  readonly iosClient: UserPoolClient;
  /** Local Vite only; the API authorizer does not accept its tokens. */
  readonly devClient: UserPoolClient;
  readonly domain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config, certificate } = props;

    const hostedZone =
      props.hostedZone ??
      HostedZone.fromLookup(this, 'HostedZone', {
        domainName: APEX_DOMAIN,
      });

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `gagnechris-${config.name}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: `You're invited to ${APEX_DOMAIN}`,
        emailBody: [
          `You've been given access to ${APEX_DOMAIN}.`,
          'Username: {username}<br>Temporary password: {####}',
          `Sign in at https://${ADMIN_HOST} (Admin) or https://${NOTEBOOK_HOST} (Notebook), whichever you were given. You'll choose a new password, then you can add a passkey to sign in with Face ID or Touch ID next time.`,
          'The temporary password works for 7 days. If it runs out, ask for a new invite.',
        ].join('<br><br>'),
      },
      // Cognito forbids MFA=REQUIRED with WebAuthn as a first factor.
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      featurePlan: FeaturePlan.ESSENTIALS,
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          passkey: true,
        },
      },
      passkeyRelyingPartyId: AUTH_DOMAIN,
      passkeyUserVerification: PasskeyUserVerification.PREFERRED,
      deletionProtection: config.name === 'prod',
      removalPolicy: config.statefulRemovalPolicy,
      enableSmsRole: false,
    });

    NagSuppressions.addResourceSuppressions(this.userPool, [
      {
        id: 'AwsSolutions-COG2',
        reason:
          'MFA cannot be REQUIRED when WebAuthn is an allowed first auth factor (Cognito SINGLE_FACTOR constraint). Passkeys are phishing-resistant; TOTP MFA is OPTIONAL for password fallback.',
      },
      {
        id: 'AwsSolutions-COG8',
        reason:
          'Essentials tier covers managed login and passkeys; Plus (threat protection) remains optional and out of scope.',
      },
    ]);

    // Prod clients never trust localhost; local Vite uses devClient.
    const callbackUrls = [`https://${APEX_DOMAIN}/auth/callback`];
    const logoutUrls = [`https://${APEX_DOMAIN}/`];

    const clientCommon = {
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      authFlows: {
        userSrp: true,
        user: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      refreshTokenRotationGracePeriod: Duration.seconds(30),
    };

    // Each app client trusts only its own host, so a script on one host can't
    // land the other client's code on a callback it controls.
    const hostOAuth = (host: string) => ({
      ...clientCommon.oAuth,
      callbackUrls: [`https://${host}/auth/callback`],
      logoutUrls: [`https://${host}/`],
    });

    this.adminWebClient = this.userPool.addClient('AdminWebClient', {
      ...clientCommon,
      userPoolClientName: 'admin-web',
      oAuth: hostOAuth(ADMIN_HOST),
    });

    this.notebookWebClient = this.userPool.addClient('NotebookWebClient', {
      ...clientCommon,
      userPoolClientName: 'notebook-web',
      oAuth: hostOAuth(NOTEBOOK_HOST),
    });

    // The custom scheme stays only until the app's sign-in passes
    // preferUniversalLinks; TestFlight builds use the https URLs, which iOS
    // returns only to an app the notebook host's AASA names (webcredentials).
    this.iosClient = this.userPool.addClient('IosClient', {
      ...clientCommon,
      userPoolClientName: 'ios',
      oAuth: {
        ...clientCommon.oAuth,
        callbackUrls: [
          `https://${NOTEBOOK_HOST}/ios/auth/callback`,
          'gagnechris://auth/callback',
        ],
        logoutUrls: [
          `https://${NOTEBOOK_HOST}/ios/auth/signed-out`,
          'gagnechris://',
        ],
      },
    });

    this.devClient = this.userPool.addClient('DevClient', {
      ...clientCommon,
      userPoolClientName: 'dev-local',
      oAuth: {
        ...clientCommon.oAuth,
        callbackUrls: [DEV_ORIGIN, DEV_ADMIN_ORIGIN, DEV_NOTEBOOK_ORIGIN].map(
          (origin) => `${origin}/auth/callback`,
        ),
        logoutUrls: [DEV_ORIGIN, DEV_ADMIN_ORIGIN, DEV_NOTEBOOK_ORIGIN].map(
          (origin) => `${origin}/`,
        ),
      },
    });

    for (const [id, groupName, description] of [
      ['SiteAdmin', SITE_ADMIN_GROUP, 'Public-site CMS on the admin host'],
      ['Notebook', NOTEBOOK_GROUP, 'Notebook on the notebook host'],
      ['UserAdmin', USER_ADMIN_GROUP, 'Manage users and access in Admin'],
    ] as const) {
      const group = new CfnUserPoolGroup(this, `${id}Group`, {
        userPoolId: this.userPool.userPoolId,
        groupName,
        description,
      });
      new CfnUserPoolUserToGroupAttachment(this, `${id}GroupMembership`, {
        userPoolId: this.userPool.userPoolId,
        // Ref is the group name; it also orders the attachment after the group.
        groupName: group.ref,
        username: config.adminUsername,
      });
    }

    this.domain = this.userPool.addDomain('CustomDomain', {
      customDomain: {
        domainName: AUTH_DOMAIN,
        certificate,
      },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Managed login isn't available to a client without its own branding.
    new CfnManagedLoginBranding(this, 'AdminWebManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.adminWebClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    new CfnManagedLoginBranding(this, 'NotebookWebManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.notebookWebClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    new CfnManagedLoginBranding(this, 'IosManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.iosClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    new CfnManagedLoginBranding(this, 'DevManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.devClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    const authTarget = RecordTarget.fromAlias(
      new UserPoolDomainTarget(this.domain),
    );

    new ARecord(this, 'AuthA', {
      zone: hostedZone,
      recordName: AUTH_DOMAIN,
      target: authTarget,
      comment: 'Cognito managed login',
    });

    new AaaaRecord(this, 'AuthAaaa', {
      zone: hostedZone,
      recordName: AUTH_DOMAIN,
      target: authTarget,
      comment: 'Cognito managed login IPv6',
    });

    new StringParameter(this, 'UserPoolIdParam', {
      parameterName: ssmParameterName(config.name, 'cognitoUserPoolId'),
      stringValue: this.userPool.userPoolId,
      description: 'Cognito user pool ID',
    });

    new StringParameter(this, 'AdminWebClientIdParam', {
      parameterName: ssmParameterName(config.name, 'cognitoAdminWebClientId'),
      stringValue: this.adminWebClient.userPoolClientId,
      description: `Cognito admin-web client ID (${ADMIN_HOST}, public, PKCE)`,
    });

    new StringParameter(this, 'NotebookWebClientIdParam', {
      parameterName: ssmParameterName(
        config.name,
        'cognitoNotebookWebClientId',
      ),
      stringValue: this.notebookWebClient.userPoolClientId,
      description: `Cognito notebook-web client ID (${NOTEBOOK_HOST}, public, PKCE)`,
    });

    new StringParameter(this, 'IosClientIdParam', {
      parameterName: ssmParameterName(config.name, 'cognitoIosClientId'),
      stringValue: this.iosClient.userPoolClientId,
      description: 'Cognito iOS app client ID (public, PKCE)',
    });

    new StringParameter(this, 'DevClientIdParam', {
      parameterName: ssmParameterName(config.name, 'cognitoDevClientId'),
      stringValue: this.devClient.userPoolClientId,
      description:
        'Cognito dev client ID (localhost only; not trusted by the API)',
    });

    new StringParameter(this, 'AuthDomainParam', {
      parameterName: ssmParameterName(config.name, 'cognitoAuthDomain'),
      stringValue: AUTH_DOMAIN,
      description: 'Cognito managed-login custom domain',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito user pool ID',
    });

    new CfnOutput(this, 'AdminWebClientId', {
      value: this.adminWebClient.userPoolClientId,
      description: `${ADMIN_HOST} app client ID (no secret; auth code + PKCE)`,
    });

    new CfnOutput(this, 'NotebookWebClientId', {
      value: this.notebookWebClient.userPoolClientId,
      description: `${NOTEBOOK_HOST} app client ID (no secret; auth code + PKCE)`,
    });

    new CfnOutput(this, 'IosClientId', {
      value: this.iosClient.userPoolClientId,
      description: 'iOS app client ID (for later; no secret)',
    });

    new CfnOutput(this, 'AuthDomain', {
      value: AUTH_DOMAIN,
      description: 'Managed login custom domain',
    });

    new CfnOutput(this, 'ManagedLoginUrl', {
      value: this.domain.signInUrl(this.adminWebClient, {
        redirectUri: `https://${ADMIN_HOST}/auth/callback`,
      }),
      description: `Managed login sign-in URL (admin-web client, ${ADMIN_HOST})`,
    });
  }
}
