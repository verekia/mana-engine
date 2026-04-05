// Geometry classes for nanothree - Three.js-compatible API

export class Float32BufferAttribute {
  readonly array: Float32Array
  readonly itemSize: number

  constructor(array: ArrayLike<number>, itemSize: number) {
    this.array = array instanceof Float32Array ? array : new Float32Array(array)
    this.itemSize = itemSize
  }
}

export class BufferGeometry {
  positions: Float32Array | null = null
  normals: Float32Array | null = null
  indices: Uint16Array | Uint32Array | null = null

  // GPU resources (lazily created by renderer)
  _vertexBuffer: GPUBuffer | null = null
  _indexBuffer: GPUBuffer | null = null
  _indexCount = 0
  _indexFormat: GPUIndexFormat = 'uint16'
  _vertexCount = 0
  _gpuDirty = true
  _device: GPUDevice | null = null

  // Wireframe index buffer (lazily generated from triangle indices)
  _wireframeIndexBuffer: GPUBuffer | null = null
  _wireframeIndexCount = 0
  _wireframeIndexFormat: GPUIndexFormat = 'uint16'
  _wireframeDirty = true

  setAttribute(name: string, attribute: Float32BufferAttribute) {
    if (name === 'position') {
      this.positions = attribute.array
    } else if (name === 'normal') {
      this.normals = attribute.array
    }
    this._gpuDirty = true
    this._wireframeDirty = true
    return this
  }

  setIndex(indices: ArrayLike<number>) {
    if (indices instanceof Uint16Array) {
      this.indices = indices
    } else if (indices instanceof Uint32Array) {
      this.indices = indices
    } else {
      this.indices = new Uint16Array(indices)
    }
    this._gpuDirty = true
    this._wireframeDirty = true
    return this
  }

  _ensureGPU(device: GPUDevice) {
    if (!this._gpuDirty && this._device === device) return
    this._device = device

    const positions = this.positions!
    const normals = this.normals
    const vertexCount = positions.length / 3
    this._vertexCount = vertexCount

    // Interleave position + normal (normals default to 0 if absent)
    const interleaved = new Float32Array(vertexCount * 6)
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      const i6 = i * 6
      interleaved[i6] = positions[i3]
      interleaved[i6 + 1] = positions[i3 + 1]
      interleaved[i6 + 2] = positions[i3 + 2]
      if (normals) {
        interleaved[i6 + 3] = normals[i3]
        interleaved[i6 + 4] = normals[i3 + 1]
        interleaved[i6 + 5] = normals[i3 + 2]
      }
    }

    if (this._vertexBuffer) this._vertexBuffer.destroy()
    this._vertexBuffer = device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this._vertexBuffer, 0, interleaved)

    if (this.indices) {
      const idx = this.indices
      this._indexCount = idx.length
      this._indexFormat = idx instanceof Uint32Array ? 'uint32' : 'uint16'
      if (this._indexBuffer) this._indexBuffer.destroy()
      this._indexBuffer = device.createBuffer({
        size: idx.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(this._indexBuffer, 0, idx)
    } else {
      this._indexCount = 0
      if (this._indexBuffer) {
        this._indexBuffer.destroy()
        this._indexBuffer = null
      }
    }

    this._gpuDirty = false
  }

  _ensureWireframeGPU(device: GPUDevice) {
    this._ensureGPU(device)
    if (!this._wireframeDirty && this._device === device) return
    if (!this.indices) return

    const triIndices = this.indices
    const triCount = triIndices.length / 3
    const use32 = triIndices instanceof Uint32Array
    this._wireframeIndexFormat = use32 ? 'uint32' : 'uint16'
    const wireIndices = use32 ? new Uint32Array(triCount * 6) : new Uint16Array(triCount * 6)

    for (let i = 0; i < triCount; i++) {
      const i3 = i * 3
      const a = triIndices[i3],
        b = triIndices[i3 + 1],
        c = triIndices[i3 + 2]
      const i6 = i * 6
      wireIndices[i6] = a
      wireIndices[i6 + 1] = b
      wireIndices[i6 + 2] = b
      wireIndices[i6 + 3] = c
      wireIndices[i6 + 4] = c
      wireIndices[i6 + 5] = a
    }

    this._wireframeIndexCount = wireIndices.length
    if (this._wireframeIndexBuffer) this._wireframeIndexBuffer.destroy()
    this._wireframeIndexBuffer = device.createBuffer({
      size: wireIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this._wireframeIndexBuffer, 0, wireIndices)
    this._wireframeDirty = false
  }

  dispose() {
    this._vertexBuffer?.destroy()
    this._indexBuffer?.destroy()
    this._wireframeIndexBuffer?.destroy()
    this._vertexBuffer = null
    this._indexBuffer = null
    this._wireframeIndexBuffer = null
    this._device = null
    this._gpuDirty = true
    this._wireframeDirty = true
  }
}

// ── BoxGeometry ─────────────────────────────────────────────────────────
// Ported from Three.js BoxGeometry — identical vertex output.

export class BoxGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1) {
    super()

    widthSegments = Math.floor(widthSegments)
    heightSegments = Math.floor(heightSegments)
    depthSegments = Math.floor(depthSegments)

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    let numberOfVertices = 0

    // Build each side of the box. The u/v/w indices select which axis is which:
    //   u=0 -> x,  u=1 -> y,  u=2 -> z
    const buildPlane = (
      u: number,
      v: number,
      w: number,
      udir: number,
      vdir: number,
      planeWidth: number,
      planeHeight: number,
      planeDepth: number,
      gridX: number,
      gridY: number,
    ) => {
      const segmentWidth = planeWidth / gridX
      const segmentHeight = planeHeight / gridY
      const widthHalf = planeWidth / 2
      const heightHalf = planeHeight / 2
      const depthHalf = planeDepth / 2
      const gridX1 = gridX + 1
      const gridY1 = gridY + 1
      let vertexCounter = 0

      for (let iy = 0; iy < gridY1; iy++) {
        const y = iy * segmentHeight - heightHalf
        for (let ix = 0; ix < gridX1; ix++) {
          const x = ix * segmentWidth - widthHalf
          const vec = [0, 0, 0]
          vec[u] = x * udir
          vec[v] = y * vdir
          vec[w] = depthHalf
          vertices.push(vec[0], vec[1], vec[2])

          vec[u] = 0
          vec[v] = 0
          vec[w] = planeDepth > 0 ? 1 : -1
          normals.push(vec[0], vec[1], vec[2])

          vertexCounter++
        }
      }

      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = numberOfVertices + ix + gridX1 * iy
          const b = numberOfVertices + ix + gridX1 * (iy + 1)
          const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1)
          const d = numberOfVertices + (ix + 1) + gridX1 * iy
          indices.push(a, b, d)
          indices.push(b, c, d)
        }
      }

      numberOfVertices += vertexCounter
    }

    // u, v, w mapped to axis indices: x=0, y=1, z=2
    buildPlane(2, 1, 0, -1, -1, depth, height, width, depthSegments, heightSegments) // px
    buildPlane(2, 1, 0, 1, -1, depth, height, -width, depthSegments, heightSegments) // nx
    buildPlane(0, 2, 1, 1, 1, width, depth, height, widthSegments, depthSegments) // py
    buildPlane(0, 2, 1, 1, -1, width, depth, -height, widthSegments, depthSegments) // ny
    buildPlane(0, 1, 2, 1, -1, width, height, depth, widthSegments, heightSegments) // pz
    buildPlane(0, 1, 2, -1, -1, width, height, -depth, widthSegments, heightSegments) // nz

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── SphereGeometry ──────────────────────────────────────────────────────
// Ported from Three.js SphereGeometry — identical vertex output.

export class SphereGeometry extends BufferGeometry {
  constructor(
    radius = 1,
    widthSegments = 32,
    heightSegments = 16,
    phiStart = 0,
    phiLength = Math.PI * 2,
    thetaStart = 0,
    thetaLength = Math.PI,
  ) {
    super()

    widthSegments = Math.max(3, Math.floor(widthSegments))
    heightSegments = Math.max(2, Math.floor(heightSegments))

    const thetaEnd = Math.min(thetaStart + thetaLength, Math.PI)

    let index = 0
    const grid: number[][] = []

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    for (let iy = 0; iy <= heightSegments; iy++) {
      const verticesRow: number[] = []
      const v = iy / heightSegments

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments

        const vx = -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength)
        const vy = radius * Math.cos(thetaStart + v * thetaLength)
        const vz = radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength)

        vertices.push(vx, vy, vz)

        // Normal = normalized vertex position
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
        normals.push(vx / len, vy / len, vz / len)

        verticesRow.push(index++)
      }

      grid.push(verticesRow)
    }

    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1]
        const b = grid[iy][ix]
        const c = grid[iy + 1][ix]
        const d = grid[iy + 1][ix + 1]

        if (iy !== 0 || thetaStart > 0) indices.push(a, b, d)
        if (iy !== heightSegments - 1 || thetaEnd < Math.PI) indices.push(b, c, d)
      }
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── CapsuleGeometry ─────────────────────────────────────────────────────
// Ported from Three.js CapsuleGeometry — identical vertex output.

export class CapsuleGeometry extends BufferGeometry {
  constructor(radius = 1, height = 1, capSegments = 4, radialSegments = 8, heightSegments = 1) {
    super()

    height = Math.max(0, height)
    capSegments = Math.max(1, Math.floor(capSegments))
    radialSegments = Math.max(3, Math.floor(radialSegments))
    heightSegments = Math.max(1, Math.floor(heightSegments))

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    const halfHeight = height / 2
    const numVerticalSegments = capSegments * 2 + heightSegments
    const verticesPerRow = radialSegments + 1

    for (let iy = 0; iy <= numVerticalSegments; iy++) {
      let profileY = 0
      let profileRadius = 0
      let normalYComponent = 0

      if (iy <= capSegments) {
        // Bottom cap
        const segmentProgress = iy / capSegments
        const angle = (segmentProgress * Math.PI) / 2
        profileY = -halfHeight - radius * Math.cos(angle)
        profileRadius = radius * Math.sin(angle)
        normalYComponent = -radius * Math.cos(angle)
      } else if (iy <= capSegments + heightSegments) {
        // Middle section
        const segmentProgress = (iy - capSegments) / heightSegments
        profileY = -halfHeight + segmentProgress * height
        profileRadius = radius
        normalYComponent = 0
      } else {
        // Top cap
        const segmentProgress = (iy - capSegments - heightSegments) / capSegments
        const angle = (segmentProgress * Math.PI) / 2
        profileY = halfHeight + radius * Math.sin(angle)
        profileRadius = radius * Math.cos(angle)
        normalYComponent = radius * Math.sin(angle)
      }

      for (let ix = 0; ix <= radialSegments; ix++) {
        const u = ix / radialSegments
        const theta = u * Math.PI * 2
        const sinTheta = Math.sin(theta)
        const cosTheta = Math.cos(theta)

        vertices.push(-profileRadius * cosTheta, profileY, profileRadius * sinTheta)

        // Normal
        let nx = -profileRadius * cosTheta
        let ny = normalYComponent
        let nz = profileRadius * sinTheta
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        nx /= len
        ny /= len
        nz /= len
        normals.push(nx, ny, nz)
      }

      if (iy > 0) {
        const prevIndexRow = (iy - 1) * verticesPerRow
        for (let ix = 0; ix < radialSegments; ix++) {
          const i1 = prevIndexRow + ix
          const i2 = prevIndexRow + ix + 1
          const i3 = iy * verticesPerRow + ix
          const i4 = iy * verticesPerRow + ix + 1
          indices.push(i1, i2, i3)
          indices.push(i2, i4, i3)
        }
      }
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── CylinderGeometry ────────────────────────────────────────────────────
// Ported from Three.js CylinderGeometry — identical vertex output.

export class CylinderGeometry extends BufferGeometry {
  constructor(
    radiusTop = 1,
    radiusBottom = 1,
    height = 1,
    radialSegments = 32,
    heightSegments = 1,
    openEnded = false,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ) {
    super()

    radialSegments = Math.floor(radialSegments)
    heightSegments = Math.floor(heightSegments)

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    let index = 0
    const indexArray: number[][] = []
    const halfHeight = height / 2

    // ── Torso ──
    const slope = (radiusBottom - radiusTop) / height

    for (let y = 0; y <= heightSegments; y++) {
      const indexRow: number[] = []
      const v = y / heightSegments
      const radius = v * (radiusBottom - radiusTop) + radiusTop

      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments
        const theta = u * thetaLength + thetaStart
        const sinTheta = Math.sin(theta)
        const cosTheta = Math.cos(theta)

        vertices.push(radius * sinTheta, -v * height + halfHeight, radius * cosTheta)

        // Normal
        let nx = sinTheta,
          ny = slope,
          nz = cosTheta
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        nx /= len
        ny /= len
        nz /= len
        normals.push(nx, ny, nz)

        indexRow.push(index++)
      }

      indexArray.push(indexRow)
    }

    for (let x = 0; x < radialSegments; x++) {
      for (let y = 0; y < heightSegments; y++) {
        const a = indexArray[y][x]
        const b = indexArray[y + 1][x]
        const c = indexArray[y + 1][x + 1]
        const d = indexArray[y][x + 1]

        if (radiusTop > 0 || y !== 0) indices.push(a, b, d)
        if (radiusBottom > 0 || y !== heightSegments - 1) indices.push(b, c, d)
      }
    }

    // ── Caps ──
    if (!openEnded) {
      const generateCap = (top: boolean) => {
        const radius = top ? radiusTop : radiusBottom
        const sign = top ? 1 : -1

        // Center vertices (one per radial segment for per-face UVs in Three.js)
        const centerIndexStart = index
        for (let x = 1; x <= radialSegments; x++) {
          vertices.push(0, halfHeight * sign, 0)
          normals.push(0, sign, 0)
          index++
        }
        const centerIndexEnd = index

        // Perimeter vertices
        for (let x = 0; x <= radialSegments; x++) {
          const u = x / radialSegments
          const theta = u * thetaLength + thetaStart
          const cosTheta = Math.cos(theta)
          const sinTheta = Math.sin(theta)
          vertices.push(radius * sinTheta, halfHeight * sign, radius * cosTheta)
          normals.push(0, sign, 0)
          index++
        }

        // Indices
        for (let x = 0; x < radialSegments; x++) {
          const c = centerIndexStart + x
          const i = centerIndexEnd + x
          if (top) {
            indices.push(i, i + 1, c)
          } else {
            indices.push(i + 1, i, c)
          }
        }
      }

      if (radiusTop > 0) generateCap(true)
      if (radiusBottom > 0) generateCap(false)
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── CircleGeometry ──────────────────────────────────────────────────────
// Ported from Three.js CircleGeometry — identical vertex output.

export class CircleGeometry extends BufferGeometry {
  constructor(radius = 1, segments = 32, thetaStart = 0, thetaLength = Math.PI * 2) {
    super()

    segments = Math.max(3, segments)

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    // Center point
    vertices.push(0, 0, 0)
    normals.push(0, 0, 1)

    for (let s = 0; s <= segments; s++) {
      const segment = thetaStart + (s / segments) * thetaLength

      vertices.push(radius * Math.cos(segment), radius * Math.sin(segment), 0)
      normals.push(0, 0, 1)
    }

    for (let i = 1; i <= segments; i++) {
      indices.push(i, i + 1, 0)
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── ConeGeometry ────────────────────────────────────────────────────────
// Ported from Three.js ConeGeometry — CylinderGeometry with radiusTop=0.

export class ConeGeometry extends CylinderGeometry {
  constructor(
    radius = 1,
    height = 1,
    radialSegments = 32,
    heightSegments = 1,
    openEnded = false,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ) {
    super(0, radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength)
  }
}

// ── PlaneGeometry ───────────────────────────────────────────────────────
// Ported from Three.js PlaneGeometry — identical vertex output.

export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super()

    const widthHalf = width / 2
    const heightHalf = height / 2

    const gridX = Math.floor(widthSegments)
    const gridY = Math.floor(heightSegments)

    const gridX1 = gridX + 1
    const gridY1 = gridY + 1

    const segmentWidth = width / gridX
    const segmentHeight = height / gridY

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf
      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf
        vertices.push(x, -y, 0)
        normals.push(0, 0, 1)
      }
    }

    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy
        const b = ix + gridX1 * (iy + 1)
        const c = ix + 1 + gridX1 * (iy + 1)
        const d = ix + 1 + gridX1 * iy
        indices.push(a, b, d)
        indices.push(b, c, d)
      }
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── TorusGeometry ───────────────────────────────────────────────────────
// Ported from Three.js TorusGeometry — identical vertex output.

export class TorusGeometry extends BufferGeometry {
  constructor(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48, arc = Math.PI * 2) {
    super()

    radialSegments = Math.floor(radialSegments)
    tubularSegments = Math.floor(tubularSegments)

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * arc
        const v = (j / radialSegments) * Math.PI * 2

        const cx = (radius + tube * Math.cos(v)) * Math.cos(u)
        const cy = (radius + tube * Math.cos(v)) * Math.sin(u)
        const cz = tube * Math.sin(v)
        vertices.push(cx, cy, cz)

        // Normal = vertex position - center of tube ring
        const nx = cx - radius * Math.cos(u)
        const ny = cy - radius * Math.sin(u)
        const nz = cz
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        normals.push(nx / len, ny / len, nz / len)
      }
    }

    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1
        const b = (tubularSegments + 1) * (j - 1) + i - 1
        const c = (tubularSegments + 1) * (j - 1) + i
        const d = (tubularSegments + 1) * j + i
        indices.push(a, b, d)
        indices.push(b, c, d)
      }
    }

    this.positions = new Float32Array(vertices)
    this.normals = new Float32Array(normals)
    this.indices = new Uint16Array(indices)
  }
}

// ── TetrahedronGeometry ─────────────────────────────────────────────────
// Ported from Three.js PolyhedronGeometry (detail=0) — identical vertex output.
// Three.js TetrahedronGeometry extends PolyhedronGeometry which projects
// vertices onto a sphere and uses flat (face) normals at detail=0.

export class TetrahedronGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super()

    // Three.js tetrahedron base vertices and face indices
    const baseVertices = [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]
    const faceIndices = [2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1]

    // Build non-indexed geometry: 4 faces × 3 vertices = 12 vertices
    const positions: number[] = []
    const normals: number[] = []

    for (let i = 0; i < faceIndices.length; i += 3) {
      const verts: number[][] = []
      for (let j = 0; j < 3; j++) {
        const idx = faceIndices[i + j] * 3
        let vx = baseVertices[idx]
        let vy = baseVertices[idx + 1]
        let vz = baseVertices[idx + 2]
        // Project onto sphere of given radius
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
        vx = (vx / len) * radius
        vy = (vy / len) * radius
        vz = (vz / len) * radius
        verts.push([vx, vy, vz])
        positions.push(vx, vy, vz)
      }

      // Flat face normal (cross product of two edges)
      const ax = verts[0][0],
        ay = verts[0][1],
        az = verts[0][2]
      const bx = verts[1][0],
        by = verts[1][1],
        bz = verts[1][2]
      const cx = verts[2][0],
        cy = verts[2][1],
        cz = verts[2][2]
      const e1x = bx - ax,
        e1y = by - ay,
        e1z = bz - az
      const e2x = cx - ax,
        e2y = cy - ay,
        e2z = cz - az
      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= nLen
      ny /= nLen
      nz /= nLen
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    }

    // Non-indexed: sequential indices 0..11
    const indices = new Uint16Array(positions.length / 3)
    for (let i = 0; i < indices.length; i++) indices[i] = i

    this.positions = new Float32Array(positions)
    this.normals = new Float32Array(normals)
    this.indices = indices
  }
}
