import { Construct } from 'constructs'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'

interface CloudFrontPropsDistribution {
  staticBucket: s3.Bucket
  ebEnv: elasticbeanstalk.CfnEnvironment
}

export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.CloudFrontWebDistribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const { staticBucket, ebEnv } = props

    this.cf = new cloudfront.CloudFrontWebDistribution(this, id, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      defaultRootObject: '',
      originConfigs: [
        {
          customOriginSource: {
            domainName: ebEnv.attrEndpointUrl,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY // Load balancer requires SSL certificate to accept HTTPS requests.
          },
          behaviors: [{ isDefaultBehavior: true }]
        },
        {
          s3OriginSource: {
            s3BucketSource: staticBucket
          },
          behaviors: [{ pathPattern: '/_next/*' }]
        }
      ]
    })
  }
}
