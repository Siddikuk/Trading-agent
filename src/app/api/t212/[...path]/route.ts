import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const apiKey = request.headers.get('x-t212-key')
  const accountType = request.headers.get('x-t212-account') || 'live'

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key' }, { status: 401 })
  }

  const base =
    accountType === 'demo'
      ? 'https://demo.trading212.com/api/v0'
      : 'https://live.trading212.com/api/v0'

  const endpoint = path.join('/')
  const url = new URL(`${base}/${endpoint}`)

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      // 10s timeout
      signal: AbortSignal.timeout(10000),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 }
    )
  }
}
