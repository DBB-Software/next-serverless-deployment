import { Construct } from 'constructs'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import * as ecr from 'aws-cdk-lib/aws-ecr'

interface BeanstalkDistributionProps {
  appName: string
}

export class BeanstalkDistribution extends Construct {
  constructor(scope: Construct, id: string, props: BeanstalkDistributionProps) {
    super(scope, id)

    const { appName } = props

    const beanstalkApp = new elasticbeanstalk.CfnApplication(this, `${appName}Application`, {
      applicationName: appName
    })

    new ecr.CfnRepository(this, `${appName}Repository`)

    new elasticbeanstalk.CfnEnvironment(this, `${appName}Environment`, {
      environmentName: `${appName}Environment`,
      applicationName: beanstalkApp.applicationName ?? appName
    })
  }
}
