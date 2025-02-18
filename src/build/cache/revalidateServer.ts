import express from 'express'
import { json } from 'body-parser'
import http from 'http'

const port = parseInt(process.env.PORT || '', 10) || 3000
const nextServerPort = 3001
const nextServerHostname = process.env.HOSTNAME || '0.0.0.0'

interface RevalidateBody {
  paths: string[]
}

const app = express()

app.use(json())

app.post('/api/revalidate-pages', async (req, res) => {
  try {
    const { paths } = req.body as RevalidateBody

    if (!paths.length) {
      res.status(400).json({ Message: 'paths is required.' }).end()
      return
    }

    await Promise.all(
      paths.map((path) =>
        http.get({
          hostname: nextServerHostname,
          port: nextServerPort,
          path
        })
      )
    )

    res.status(200).json({ Message: 'Revalidated.' })
  } catch (err) {
    console.error('Failed to revalidate:', err)
    res.status(400).json({ Message: err })
  }
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`> Revalidation server ready on port ${port}`)
})
