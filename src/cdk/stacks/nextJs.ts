import { Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'

export class Nextjs extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id)

    const appName = 'NextServer'

    new BeanstalkDistribution(scope, id, { appName })
  }
}
