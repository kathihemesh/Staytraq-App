import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  // Target is the live VPS HTTP endpoint
  const targetHost = process.env.CHATBOT_API_URL || "http://144.91.79.198"
  const subPath = pathSegments.join("/")
  const searchParams = request.nextUrl.search
  const targetUrl = `${targetHost}/${subPath}${searchParams}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    // Forward necessary headers but exclude Host
    if (key.toLowerCase() !== "host") {
      headers.set(key, value)
    }
  })

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      // Forward body payload securely
      const blob = await request.blob()
      if (blob.size > 0) {
        fetchOptions.body = blob
      }
    }

    const response = await fetch(targetUrl, fetchOptions)
    
    // Get response content
    const responseData = await response.blob()
    
    // Forward the response back to the client
    const clientHeaders = new Headers()
    response.headers.forEach((value, key) => {
      clientHeaders.set(key, value)
    })

    return new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: clientHeaders,
    })
  } catch (error) {
    console.error("Chatbot Proxy Error:", error)
    return NextResponse.json(
      { error: "Failed to proxy request to chatbot service" },
      { status: 500 }
    )
  }
}
