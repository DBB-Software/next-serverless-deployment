import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { RemovalPolicy } from 'aws-cdk-lib'

interface BeanstalkDistributionProps {
  appName: string
  stage: string
}

export class BeanstalkDistribution extends Construct {
  public readonly ebApp: elasticbeanstalk.CfnApplication
  public readonly ebEnv: elasticbeanstalk.CfnEnvironment
  public readonly ebS3: s3.Bucket

  constructor(scope: Construct, id: string, props: BeanstalkDistributionProps) {
    super(scope, id)

    const { appName, stage } = props

    this.ebApp = new elasticbeanstalk.CfnApplication(this, `${appName}-application`, {
      applicationName: appName
    })

    this.ebEnv = new elasticbeanstalk.CfnEnvironment(this, `${appName}-environment`, {
      environmentName: `${appName}-environment`,
      applicationName: this.ebApp.applicationName ?? `${appName}-application`,
      solutionStackName: '64bit Amazon Linux 2 v3.4.2 running Node.js 20',
      optionSettings: [
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'NODE_ENV',
          value: stage
        }
      ]
    })

    this.ebS3 = new s3.Bucket(this, `${appName}-versions`, {
      removalPolicy: stage === 'production' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN
    })
  }
}
