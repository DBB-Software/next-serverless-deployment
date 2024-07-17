# NextJS Serverless Deployment

## Introduction
`@dbbs/next-serverless-deployment` is design to elevate the performance of NextJS applications by providing self-hosted solution with a robust caching solutions that are adapted to cookies, query parameters and device type.

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Deployment](#deployment)
- [CLI](#cli)  
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)
- [Contact Information](#contact-information)

## Features
- **Cache Segmentation**: Dynamically segment application cache and user's experience based on cookies, query parameters and device type.
- **Customizable**: Flexible configuration options to handle caching strategies for specific needs.
- **Deployment**: Deploy your NextJS application just with a few commands.
- **Self-Hosted**: Full control over infrastructure of your application.

## Quick Start
### Installation
```bash
npm install @dbbs/next-serverless-deployment
# or
yarn add @dbbs/next-serverless-deployment
```

### Deployment
First of all need to bootstrap necessary components for AWS CDK:
```bash
@dbbs/next-serverless-deployment bootstrap
```
>**_NOTE_**: this command should be called just once. It will call AWS CDK bootstrap to add ability to use cdk in your AWS account.

Then to deploy NextJS app run the following command:
```
@dbbs/next-serverless-deployment deploy --siteName my-awesome-app --stage development
```
This command is going to create all necessary AWS resources (if they do not exist yet), bundle NextJS application and upload all assets to AWS.

## CLI

### bootstrap
Creates all CDK resources for AWS account. This needs to be called just once for specific AWS region.
```bash
@dbbs/next-serverless-deployment bootstrap
```

### deploy
Creates AWS resources for NextJS application if they were not created. Bundles NextJS application and uploads assets to AWS related services.
```bash
@dbbs/next-serverless-deployment deploy
```
### Available parameters
| Parameter Name    | Type    | Default value | Description                                                                                                                                                       |
|-------------------|---------|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| siteName          | string  | none          | Name which is going to be used for creating AWS resources                                                                                                         |
| stage             | string  | none          | Adds prefix for AWS recource's names                                                                                                               |
| pruneBeforeDeploy | boolean | false         | Clears all site data and resources before deployment                                                                                                      |
| region            | string  | none          | AWS region. If parameter is empty going to read process.env.AWS_REGION                                                                                            |
| profile           | string  | none          | AWS profile to use for credentials. If parameter is empty going to read credentials from:<br>process.env.AWS_ACCESS_KEY_ID and process.env.AWS_SECRET_ACCESS_KEY |
| nodejs            | string  | 20            | Supports nodejs v18 and v20                                                                                                                                       |
| production        | boolean | false         | Identifies if you want to create production AWS resources. So they are going to have different delete policies to keep data in safe.                              |

## Architecture

```mermaid
sequenceDiagram
    %% Nodes

    participant User
    participant CloudFront
    participant Request Origin Lambda@Edge
    participant S3Bucket
    participant ElasticBeanstalk with Load Balancer

    %% Flows

    User ->> CloudFront: Send Request
    CloudFront ->> Request Origin Lambda@Edge: 
    Request Origin Lambda@Edge ->> S3Bucket: Sends Head request to check if file exists in S3
    alt File exists in S3
      Request Origin Lambda@Edge ->> S3Bucket: Forwarding request to S3 origin
      S3Bucket ->> CloudFront: returns cached file
    else File does not exit
      Request Origin Lambda@Edge ->> ElasticBeanstalk with Load Balancer: Sends request to render page when it does not exist in S3
      ElasticBeanstalk with Load Balancer ->> CloudFront: returns generated page
      ElasticBeanstalk with Load Balancer ->> S3Bucket: stores generated page
    end
    CloudFront ->> User: returns page result
```

## Contributing
- **Code Contributions**: When contributing code, ensure it adheres to the project's coding standards and write tests where applicable.
- **Documentation**: If you are contributing to documentation, ensure your changes are clear, concise, and helpful for other users.
- **Bug Reports and Feature Requests**: Use the GitHub Issues section to report bugs or suggest new features. Please provide as much detail as possible to help us understand the issue or feature.

## License
The next-cache-handler is open-source software licensed under the [MIT License](LICENSE).

## Contact Information
We value your feedback and contributions to the next-cache-handler. If you have any questions or suggestions or need support, here are several ways to get in touch with us:

- **General Inquiries and Support**: For any general questions about the platform or if you need assistance, please visit our website [DBB Software](https://dbbsoftware.com/) and use the contact form provided.

- **GitHub Issues**: For specific issues, feature requests, or bugs related to the platform, please use the [GitHub Issues](https://github.com/DBB-Software/next-cache-handler/issues) page. This is the fastest way to directly communicate with our development team and track the resolution of your issue.

- **Community Discussion and Contributions**: Join our community discussions on [GitHub Discussions](https://github.com/DBB-Software/next-cache-handler/discussions) for broader topics, ideas exchange, and collaborative discussions.

- **Social Media**: Follow us on our social media channels for the latest news, updates, and insights:
    - [DBB Software on LinkedIn](https://www.linkedin.com/company/dbbsoftware)
    - [DBB Software on Twitter](https://twitter.com/dbb_software)

- **Email Contact**: For more formal or detailed inquiries, feel free to reach out to us via email at [in@dbbsoftware.com](mailto:in@dbbsoftware.com).

We're always here to help and are committed to ensuring you have the best experience with the next-cache-handler. Your input and participation drive the continuous improvement of our platform.
