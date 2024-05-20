import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import { RemovalPolicy } from 'aws-cdk-lib'

interface BeanstalkDistributionProps {
  appName: string
  stage: string
  nodejs?: string
}

const NodeJSEnvironmentMapping: Record<string, string> = {
  '18': '64bit Amazon Linux 2023 v6.1.5 running Node.js 18',
  '20': '64bit Amazon Linux 2023 v6.1.5 running Node.js 20'
}

export class BeanstalkDistribution extends Construct {
  public readonly ebApp: elasticbeanstalk.CfnApplication
  public readonly ebEnv: elasticbeanstalk.CfnEnvironment
  public readonly ebS3: s3.Bucket
  public readonly ebInstanceProfile: iam.CfnInstanceProfile
  public readonly ebInstanceProfileRole: iam.Role
  public readonly s3VersionsBucketName: string

  constructor(scope: Construct, id: string, props: BeanstalkDistributionProps) {
    super(scope, id)

    const { appName, stage, nodejs } = props
    this.s3VersionsBucketName = `${appName}-versions`

    this.ebApp = new elasticbeanstalk.CfnApplication(this, `${appName}-application`, {
      applicationName: appName
    })

    this.ebInstanceProfileRole = new iam.Role(this, `${appName}-instance-profile-role`, {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')]
    })

    this.ebInstanceProfile = new iam.CfnInstanceProfile(this, `${appName}-instance-profile`, {
      roles: [this.ebInstanceProfileRole.roleName]
    })

    // Pass nodejs version to use for EB instance.
    // Uses nodejs 18 as a fallback.
    // Available platforms: https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.nodejs
    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['18']

    this.ebEnv = new elasticbeanstalk.CfnEnvironment(this, `${appName}-environment`, {
      environmentName: `${appName}-environment`,
      applicationName: this.ebApp.applicationName ?? `${appName}-application`,
      solutionStackName: nodeJSEnvironment,
      optionSettings: [
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'NODE_ENV',
          value: stage
        },
        {
          namespace: 'aws:elasticbeanstalk:environment',
          optionName: 'LoadBalancerType',
          value: 'application'
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: 't2.micro'
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: this.ebInstanceProfile.attrArn
        }
      ]
    })

    this.ebS3 = new s3.Bucket(this, this.s3VersionsBucketName, {
      removalPolicy: stage === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      bucketName: this.s3VersionsBucketName
    })
  }
}
