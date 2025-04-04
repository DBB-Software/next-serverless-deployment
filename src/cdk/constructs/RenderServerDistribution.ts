import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Vpc, Peer, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2'
import { RemovalPolicy } from 'aws-cdk-lib'
import { addOutput } from '../../common/cdk'

interface RenderServerDistributionProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
  staticS3Bucket: s3.Bucket
  region: string
  appName: string
  instanceType?: string
  minInstances?: number
  maxInstances?: number
  dynamoDBCacheTable: string
  healthCheckPath?: string
}

const NodeJSEnvironmentMapping: Record<string, string> = {
  '18': '64bit Amazon Linux 2023 v6.4.3 running Node.js 18',
  '20': '64bit Amazon Linux 2023 v6.4.3 running Node.js 20'
}

export class RenderServerDistribution extends Construct {
  public readonly ebApp: elasticbeanstalk.CfnApplication
  public readonly ebEnv: elasticbeanstalk.CfnEnvironment
  public readonly ebS3: s3.Bucket
  public readonly ebInstanceProfile: iam.CfnInstanceProfile
  public readonly ebInstanceProfileRole: iam.Role
  public readonly vpc: Vpc
  public readonly securityGroup: SecurityGroup

  constructor(scope: Construct, id: string, props: RenderServerDistributionProps) {
    super(scope, id)

    const {
      stage,
      nodejs,
      isProduction,
      staticS3Bucket,
      region,
      appName,
      instanceType = 't2.micro',
      minInstances = 1,
      maxInstances = 2,
      dynamoDBCacheTable,
      healthCheckPath = '/'
    } = props

    this.vpc = new Vpc(this, 'BeanstalkVPC', {
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24
        }
      ]
    })

    this.securityGroup = new SecurityGroup(this, 'BeanstalkSG', {
      vpc: this.vpc,
      description: 'Security Group for Elastic Beanstalk render server',
      allowAllOutbound: true
    })

    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP traffic')

    this.ebApp = new elasticbeanstalk.CfnApplication(this, 'EbApp', {
      applicationName: `${id}-eb-app`
    })

    this.ebInstanceProfileRole = new iam.Role(this, 'EbInstanceProfileRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')]
    })

    this.ebInstanceProfileRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:PutLogEvents', 'logs:CreateLogStream', 'logs:DescribeLogGroups', 'logs:DescribeLogStreams'],
        resources: ['*']
      })
    )

    this.ebInstanceProfileRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:Get*', 's3:Put*', 's3:Delete*', 's3:ListBucket'],
        resources: [staticS3Bucket.bucketArn, `${staticS3Bucket.bucketArn}/*`]
      })
    )

    this.ebInstanceProfile = new iam.CfnInstanceProfile(this, 'EbInstanceProfile', {
      roles: [this.ebInstanceProfileRole.roleName]
    })

    // Pass nodejs version to use for EB instance.
    // Uses nodejs 20 as a fallback.
    // Available platforms: https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.nodejs
    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']

    const publicSubnets = this.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }).subnetIds
    const privateSubnets = this.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }).subnetIds

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
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DYNAMODB_CACHE_TABLE',
          value: dynamoDBCacheTable
        },
        {
          namespace: 'aws:elasticbeanstalk:environment',
          optionName: 'LoadBalancerType',
          value: 'application'
        },
        {
          namespace: 'aws:elasticbeanstalk:environment:process:default',
          optionName: 'HealthCheckPath',
          value: healthCheckPath
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: instanceType
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: this.ebInstanceProfile.attrArn
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'SecurityGroups',
          value: this.securityGroup.securityGroupId
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MinSize',
          value: minInstances.toString()
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MaxSize',
          value: maxInstances.toString()
        },
        {
          namespace: 'aws:autoscaling:trigger',
          optionName: 'MeasureName',
          value: 'CPUUtilization'
        },
        {
          namespace: 'aws:autoscaling:trigger',
          optionName: 'Statistic',
          value: 'Average'
        },
        {
          namespace: 'aws:autoscaling:trigger',
          optionName: 'Unit',
          value: 'Percent'
        },
        {
          namespace: 'aws:autoscaling:trigger',
          optionName: 'UpperThreshold',
          value: '60'
        },
        {
          namespace: 'aws:autoscaling:trigger',
          optionName: 'LowerThreshold',
          value: '30'
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'VPCId',
          value: this.vpc.vpcId
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'Subnets',
          value: privateSubnets.join(',')
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'ELBSubnets',
          value: publicSubnets.join(',')
        },
        {
          namespace: 'aws:elasticbeanstalk:cloudwatch:logs',
          optionName: 'StreamLogs',
          value: 'true'
        }
      ]
    })

    this.ebS3 = new s3.Bucket(this, 'EbVersions', {
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction
    })

    addOutput(this, `${appName}-RenderServerDomain`, this.ebEnv.attrEndpointUrl)
    addOutput(this, `${appName}-RenderServerApplicationName`, this.ebApp.applicationName!)
    addOutput(this, `${appName}-RenderServerEnvironmentName`, this.ebEnv.environmentName!)
    addOutput(this, `${appName}-RenderServerVersionsBucketName`, this.ebS3.bucketName)
  }
}
