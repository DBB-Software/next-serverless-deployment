import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { RemovalPolicy } from 'aws-cdk-lib'

interface DynamoDBDistributionProps {
  stage: string
  appName: string
  isProduction?: boolean
}

export class DynamoDBDistribution extends Construct {
  public readonly table: dynamodb.Table

  constructor(scope: Construct, id: string, props: DynamoDBDistributionProps) {
    super(scope, id)

    const { stage, appName } = props

    this.table = new dynamodb.Table(this, 'DynamoDBCacheTable', {
      tableName: `${appName}-${stage}-dynamoCache`,
      partitionKey: {
        name: 'pageKey',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'tags',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: props.isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    })

    this.table.addGlobalSecondaryIndex({
      indexName: 'cacheKey-index',
      partitionKey: {
        name: 'pageKey',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'cacheKey',
        type: dynamodb.AttributeType.STRING
      }
    })
  }
}
