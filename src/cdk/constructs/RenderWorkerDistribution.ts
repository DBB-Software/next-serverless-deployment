import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Vpc, Peer, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { addOutput } from '../../common/cdk'

/**
 * Supported Node.js versions for the Elastic Beanstalk environment
 * Maps version numbers to their corresponding Amazon Linux 2023 solution stack names
 */
const NODE_VERSIONS: Record<string, string> = {
  '18': '64bit Amazon Linux 2023 v6.2.2 running Node.js 18',
  '20': '64bit Amazon Linux 2023 v6.2.2 running Node.js 20'
} as const

/**
 * Configuration properties for the RenderWorker stack
 * @interface RenderWorkerProps
 */
interface RenderWorkerProps {
  /** The deployment stage (e.g., 'dev', 'prod') */
  stage: string
  /** The Node.js version to use. Defaults to '20' */
  nodejs?: string
  /** Whether this is a production environment. Affects removal policies. Defaults to false */
  isProduction?: boolean
  /** The S3 bucket for storing static assets */
  staticS3Bucket: s3.Bucket
  /** AWS region where the stack will be deployed */
  region: string
  /** Name of the application */
  appName: string
  /** EC2 instance type. Defaults to 't2.micro' */
  instanceType?: string
  /** Minimum number of instances in the Auto Scaling group. Defaults to 1 */
  minInstances?: number
  /** Maximum number of instances in the Auto Scaling group. Defaults to 2 */
  maxInstances?: number
}

/**
 * Creates an Elastic Beanstalk worker environment with SQS integration
 * for processing rendering tasks.
 *
 * @class RenderWorkerStack
 * @extends {Construct}
 */
export class RenderWorkerDistribution extends Construct {
  /** The Elastic Beanstalk application */
  public readonly application: elasticbeanstalk.CfnApplication
  /** The Elastic Beanstalk environment */
  public readonly environment: elasticbeanstalk.CfnEnvironment
  /** S3 bucket for storing application versions */
  public readonly versionsBucket: s3.Bucket
  /** IAM instance profile for EC2 instances */
  public readonly instanceProfile: iam.CfnInstanceProfile
  /** VPC where the worker environment will be deployed */
  public readonly vpc: Vpc
  /** Security group for the worker environment */
  public readonly securityGroup: SecurityGroup
  /** Main SQS queue for processing jobs */
  public readonly workerQueue: sqs.Queue
  /** Dead letter queue for failed jobs */
  public readonly deadLetterQueue: sqs.Queue

  /**
   * Creates a new RenderWorkerStack
   *
   * @param {Construct} scope - The parent construct
   * @param {string} id - The construct ID
   * @param {RenderWorkerProps} props - Configuration properties
   */
  constructor(scope: Construct, id: string, props: RenderWorkerProps) {
    super(scope, id)

    const {
      stage,
      nodejs = '20',
      isProduction = false,
      staticS3Bucket,
      region,
      appName,
      instanceType = 't2.micro',
      minInstances = 1,
      maxInstances = 2
    } = props

    /**
     * Create Dead Letter Queue for failed message handling
     * Messages will be retained for 14 days
     */
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${appName}-dead-letter-queue.fifo`,
      retentionPeriod: Duration.days(14),
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      fifo: true
    })

    /**
     * Create main Worker Queue with DLQ configuration
     * Failed messages will be moved to DLQ after 3 failed attempts
     */
    this.workerQueue = new sqs.Queue(this, 'WorkerQueue', {
      queueName: `${appName}-worker-queue.fifo`,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3
      },
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      fifo: true
    })

    /**
     * Create VPC with public and private subnets
     */
    this.vpc = new Vpc(this, 'WorkerVPC', {
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

    /**
     * Create Security Group for the worker instances
     * Allows inbound HTTP traffic and all outbound traffic
     */
    this.securityGroup = new SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: this.vpc,
      description: 'Security Group for Elastic Beanstalk worker',
      allowAllOutbound: true
    })
    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80))

    /**
     * Create IAM role for EC2 instances
     * Includes required permissions for Elastic Beanstalk Worker tier
     */
    const instanceRole = new iam.Role(this, 'WorkerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWorkerTier')]
    })

    /**
     * Add S3 permissions for static asset access
     */
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:Get*', 's3:Put*', 's3:Delete*', 's3:ListBucket'],
        resources: [staticS3Bucket.bucketArn, `${staticS3Bucket.bucketArn}/*`]
      })
    )

    /**
     * Add SQS permissions for queue operations
     */
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'sqs:ChangeMessageVisibility',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
          'sqs:ReceiveMessage',
          'sqs:SendMessage'
        ],
        resources: [this.workerQueue.queueArn, this.deadLetterQueue.queueArn]
      })
    )

    /**
     * Create Instance Profile for EC2 instances
     */
    this.instanceProfile = new iam.CfnInstanceProfile(this, 'WorkerInstanceProfile', {
      roles: [instanceRole.roleName]
    })

    /**
     * Create Elastic Beanstalk application
     */
    this.application = new elasticbeanstalk.CfnApplication(this, 'WorkerApplication', {
      applicationName: `${id}-worker`
    })

    /**
     * Get subnet IDs for VPC configuration
     */
    const subnetIds = {
      public: this.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }).subnetIds,
      private: this.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }).subnetIds
    }

    /**
     * Create Elastic Beanstalk environment with worker configuration
     */
    this.environment = new elasticbeanstalk.CfnEnvironment(this, 'WorkerEnvironment', {
      environmentName: `${appName}-worker-env`,
      applicationName: this.application.applicationName!,
      solutionStackName: NODE_VERSIONS[nodejs],
      tier: {
        name: 'Worker',
        type: 'SQS/HTTP'
      },
      optionSettings: [
        // Application Environment Variables
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'NODE_ENV',
          value: stage
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'PORT',
          value: '8080'
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'HOSTNAME',
          value: '0.0.0.0'
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
          optionName: 'WORKER_QUEUE_URL',
          value: this.workerQueue.queueUrl
        },
        // Launch Configuration
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: instanceType
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: this.instanceProfile.attrArn
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'SecurityGroups',
          value: this.securityGroup.securityGroupId
        },
        // Auto Scaling Group Configuration
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
        // SQS Daemon Configuration
        {
          namespace: 'aws:elasticbeanstalk:sqsd',
          optionName: 'WorkerQueueURL',
          value: this.workerQueue.queueUrl
        },
        {
          namespace: 'aws:elasticbeanstalk:sqsd',
          optionName: 'HttpPath',
          value: '/api/revalidate'
        },
        {
          namespace: 'aws:elasticbeanstalk:sqsd',
          optionName: 'InactivityTimeout',
          value: '299'
        },
        {
          namespace: 'aws:elasticbeanstalk:sqsd',
          optionName: 'VisibilityTimeout',
          value: '300'
        },
        // VPC Configuration
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'VPCId',
          value: this.vpc.vpcId
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'Subnets',
          value: subnetIds.private.join(',')
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'ELBSubnets',
          value: subnetIds.public.join(',')
        }
      ]
    })

    /**
     * Create S3 bucket for application versions
     * Retention policy based on production flag
     */
    this.versionsBucket = new s3.Bucket(this, 'RenderWorkerVersionsBucket', {
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction
    })

    addOutput(this, `${appName}-RenderWorkerQueueUrl`, this.workerQueue.queueUrl)
    addOutput(this, `${appName}-RenderWorkerQueueArn`, this.workerQueue.queueArn)
    addOutput(this, `${appName}-RenderWorkerApplicationName`, this.application.applicationName!)
    addOutput(this, `${appName}-RenderWorkerEnvironmentName`, this.environment.environmentName!)
    addOutput(this, `${appName}-RenderWorkerVersionsBucketName`, this.versionsBucket.bucketName)
  }
}
