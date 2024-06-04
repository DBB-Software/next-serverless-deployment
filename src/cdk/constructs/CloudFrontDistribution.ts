import { Construct } from 'constructs'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'

interface CloudFrontPropsDistribution {
  staticBucket: s3.IBucket
  ebAppDomain: string
  edgeFunction: cloudfront.experimental.EdgeFunction
}

export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const { staticBucket, ebAppDomain, edgeFunction } = props

    this.cf = new cloudfront.Distribution(this, id, {
      defaultBehavior: {
        origin: new origins.S3Origin(staticBucket),
        edgeLambdas: [
          {
            functionVersion: edgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
          }
        ]
      },
      defaultRootObject: '',
      additionalBehaviors: {
        '/_next/*': {
          origin: new origins.S3Origin(staticBucket)
        },
        '/*': {
          origin: new origins.HttpOrigin(ebAppDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        }
      }
    })
  }
}
