import runChildTask from '../helpers/runChildTask'

interface BootstrapCdkProps {
  accountId: string
  region: string
}

const bootstrapCdk = ({ region, accountId }: BootstrapCdkProps, env: NodeJS.ProcessEnv) => {
  runChildTask(`npx cdk bootstrap aws://${accountId}/${region}`, {
    ...env,
    AWS_REGION: region
  })
}

export default bootstrapCdk
