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
  ADMIN_GROUP,
  APEX_DOMAIN,
  AUTH_DOMAIN as AUTH_DOMAIN_CONST,
  DEV_ORIGIN,
  ssmParameterName,
} from '../config/constants.js';

/** Managed-login hostname (Cognito custom domain). */
export const AUTH_DOMAIN = AUTH_DOMAIN_CONST;

export interface AuthStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** ACM cert in us-east-1 covering `auth.gagnechris.com`. */
  readonly certificate: ICertificate;
  /**
   * Optional zone override for unit tests. Production uses
   * `HostedZone.fromLookup`.
   */
  readonly hostedZone?: IHostedZone;
}

/**
 * Single-admin Cognito user pool: passkeys + TOTP MFA, managed login on
 * auth.gagnechris.com, public web/ios clients (auth code + PKCE).
 */
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly webClient: UserPoolClient;
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
      // Cognito forbids MFA=REQUIRED with WebAuthn as a first factor (SINGLE_FACTOR).
      // Passkeys are the primary factor; TOTP remains available for password sign-in.
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
          'Essentials tier covers managed login and passkeys; Plus (threat protection) remains optional and out of scope for CHR-27.',
      },
    ]);

    // Prod clients never trust localhost (CHR-195); local Vite uses devClient.
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

    this.webClient = this.userPool.addClient('WebClient', {
      ...clientCommon,
      userPoolClientName: 'web',
    });

    this.iosClient = this.userPool.addClient('IosClient', {
      ...clientCommon,
      userPoolClientName: 'ios',
      oAuth: {
        ...clientCommon.oAuth,
        callbackUrls: [...callbackUrls, 'gagnechris://auth/callback'],
        logoutUrls: [...logoutUrls, 'gagnechris://'],
      },
    });

    this.devClient = this.userPool.addClient('DevClient', {
      ...clientCommon,
      userPoolClientName: 'dev-local',
      oAuth: {
        ...clientCommon.oAuth,
        callbackUrls: [`${DEV_ORIGIN}/auth/callback`],
        logoutUrls: [`${DEV_ORIGIN}/`],
      },
    });

    // Admin and notebook routes require this group (CHR-195).
    const adminGroup = new CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: ADMIN_GROUP,
      description: 'Site owner: CMS and Notebook access',
    });
    const adminMembership = new CfnUserPoolUserToGroupAttachment(
      this,
      'AdminGroupMembership',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: ADMIN_GROUP,
        username: config.adminUsername,
      },
    );
    adminMembership.addDependency(adminGroup);

    this.domain = this.userPool.addDomain('CustomDomain', {
      customDomain: {
        domainName: AUTH_DOMAIN,
        certificate,
      },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    new CfnManagedLoginBranding(this, 'WebManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.webClient.userPoolClientId,
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

    new StringParameter(this, 'WebClientIdParam', {
      parameterName: ssmParameterName(config.name, 'cognitoWebClientId'),
      stringValue: this.webClient.userPoolClientId,
      description: 'Cognito web app client ID (public, PKCE)',
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

    new CfnOutput(this, 'WebClientId', {
      value: this.webClient.userPoolClientId,
      description: 'Web app client ID (no secret; auth code + PKCE)',
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
      value: this.domain.signInUrl(this.webClient, {
        redirectUri: `https://${APEX_DOMAIN}/auth/callback`,
      }),
      description: 'Managed login sign-in URL (web client)',
    });
  }
}
