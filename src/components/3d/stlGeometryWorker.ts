import { STLLoader } from 'three/addons/loaders/STLLoader.js'

interface ParseRequest {
  id: number
  path: string
}

type ParseResponse =
  | { id: number; position: Float32Array; normal?: Float32Array }
  | { id: number; error: string }

self.onmessage = async ({ data }: MessageEvent<ParseRequest>) => {
  try {
    const response = await fetch(data.path)
    if (!response.ok) {
      throw new Error(`Failed to fetch STL model (${response.status}): ${data.path}`)
    }

    const geometry = new STLLoader().parse(await response.arrayBuffer())
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute || !(positionAttribute.array instanceof Float32Array)) {
      throw new Error(`STL model has no valid position data: ${data.path}`)
    }

    const position = new Float32Array(positionAttribute.array)
    const normalAttribute = geometry.getAttribute('normal')
    const normal =
      normalAttribute?.array instanceof Float32Array
        ? new Float32Array(normalAttribute.array)
        : undefined

    const result: ParseResponse = { id: data.id, position, normal }
    const transfers: ArrayBuffer[] = [position.buffer]
    if (normal) transfers.push(normal.buffer)
    self.postMessage(result, { transfer: transfers })
    geometry.dispose()
  } catch (error) {
    const result: ParseResponse = {
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(result)
  }
}
