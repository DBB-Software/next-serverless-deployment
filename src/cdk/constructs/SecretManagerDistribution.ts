import { Construct } from 'constructs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'

interface SecretManagerDistributionProps {
  secretName: string
}

export class SecretManagerDistribution extends Construct {
  public readonly xApiKey: secretsmanager.Secret

  constructor(scope: Construct, id: string, props: SecretManagerDistributionProps) {
    super(scope, id)

    const { secretName } = props

    this.xApiKey = new secretsmanager.Secret(this, 'XApiKey', {
      secretName: secretName
    })
  }
}
