import { Construct } from 'constructs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'

export class SecretManagerDistribution extends Construct {
  public readonly xApiKey: secretsmanager.Secret

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.xApiKey = new secretsmanager.Secret(this, 'XApiKey', {
      secretName: 'x-api-key'
    })
  }
}
