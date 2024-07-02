import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import { RemovalPolicy } from 'aws-cdk-lib'
import { addOutput } from '../../common/cdk'

interface BeanstalkDistributionProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
  staticS3Bucket: s3.Bucket
  region: string
  appName: string
}

const NodeJSEnvironmentMapping: Record<string, string> = {
  '18': '64bit Amazon Linux 2023 v6.1.6 running Node.js 18',
  '20': '64bit Amazon Linux 2023 v6.1.6 running Node.js 20'
}

export class BeanstalkDistribution extends Construct {
  public readonly ebApp: elasticbeanstalk.CfnApplication
  public readonly ebEnv: elasticbeanstalk.CfnEnvironment
  public readonly ebS3: s3.Bucket
  public readonly ebInstanceProfile: iam.CfnInstanceProfile
  public readonly ebInstanceProfileRole: iam.Role

  constructor(scope: Construct, id: string, props: BeanstalkDistributionProps) {
    super(scope, id)

    const { stage, nodejs, isProduction, staticS3Bucket, region, appName } = props

    this.ebApp = new elasticbeanstalk.CfnApplication(this, 'EbApp', {
      applicationName: `${id}-eb-app`
    })

    this.ebInstanceProfileRole = new iam.Role(this, 'EbInstanceProfileRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')]
    })

    this.ebInstanceProfileRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:PutObjectAcl'],
        resources: [`${staticS3Bucket.bucketArn}/*`]
      })
    )

    this.ebInstanceProfile = new iam.CfnInstanceProfile(this, 'EbInstanceProfile', {
      roles: [this.ebInstanceProfileRole.roleName]
    })

    // Pass nodejs version to use for EB instance.
    // Uses nodejs 18 as a fallback.
    // Available platforms: https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.nodejs
    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['18']

    this.ebEnv = new elasticbeanstalk.CfnEnvironment(this, 'EbEnv', {
      environmentName: `${appName}-eb-env`,
      applicationName: this.ebApp.applicationName!,
      solutionStackName: nodeJSEnvironment,
      optionSettings: [
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'NODE_ENV',
          value: stage
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STATIC_BUCKET_NAME',
          value: staticS3Bucket.bucketName
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'AWS_REGION',
          value: region
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

    this.ebS3 = new s3.Bucket(this, 'EbVersions', {
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction
    })

    addOutput(this, `${appName}-BeanstalkDomain`, this.ebEnv.attrEndpointUrl)
    addOutput(this, `${appName}-BeanstalkApplicationName`, this.ebApp.applicationName!)
    addOutput(this, `${appName}-BeanstalkEnvironmentName`, this.ebEnv.environmentName!)
    addOutput(this, `${appName}-BeanstalkVersionsBucketName`, this.ebS3.bucketName)
  }
}
