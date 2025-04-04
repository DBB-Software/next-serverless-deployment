import type { APIGatewayEvent } from 'aws-lambda'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const sqs = new SQSClient({ region: process.env.SQS_AWS_REGION })
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION })

const getSecretXApiKey = async () => {
  const secretData = await secretsManager.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }))

  return secretData.SecretString
}

export const handler = async (event: APIGatewayEvent) => {
  try {
    const xApiKey = await getSecretXApiKey()

    if (!event.headers['x-api-key'] || event.headers['x-api-key'] !== xApiKey) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      }
    }

    const body = JSON.parse(event.body ?? '{}')

    if (!body.paths) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Paths are required' })
      }
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(body),
        MessageGroupId: 'revalidate',
        MessageDeduplicationId: new Date().toISOString()
      })
    )

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Revalidation request sent to queue.' })
    }
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    }
  }
}
