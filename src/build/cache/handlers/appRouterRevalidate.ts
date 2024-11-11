export default `import { NextResponse, NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'

export const POST = async (req: NextRequest) => {
  try {
    const { path } = await req.json()

    revalidatePath(path)

    return NextResponse.json({ message: 'Revalidated' }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
`
