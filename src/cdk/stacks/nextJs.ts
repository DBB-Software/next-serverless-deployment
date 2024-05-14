import { Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'

interface NextjsProps {
  stage: string
}

export class Nextjs extends Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution

  constructor(scope: Construct, id: string, props: NextjsProps) {
    super(scope, id)

    const { stage } = props
    const appName = `${id}-${stage}`

    this.elasticbeanstalk = new BeanstalkDistribution(scope, id, { appName, stage })
  }
}
