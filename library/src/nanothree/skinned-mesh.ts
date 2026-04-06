// Skinned mesh support for nanothree — Three.js-compatible API

import { Object3D } from './core'
import { mat4Identity, mat4Invert, mat4Multiply } from './math'

import type { BufferGeometry } from './geometry'
import type { MeshMaterial } from './mesh'

// ── Bone ────────────────────────────────────────────────────────────────

export class Bone extends Object3D {
  readonly isBone = true
}

// ── Skeleton ────────────────────────────────────────────────────────────

const _skelTemp = new Float32Array(16)

export class Skeleton {
  bones: Bone[]
  boneInverses: Float32Array[]
  /** Flat array of 4×4 bone matrices (bone.worldMatrix × boneInverse). Updated by update(). */
  boneMatrices: Float32Array

  constructor(bones: Bone[], boneInverses?: Float32Array[]) {
    this.bones = bones
    this.boneMatrices = new Float32Array(bones.length * 16)

    if (boneInverses) {
      this.boneInverses = boneInverses
    } else {
      this.boneInverses = []
      this.calculateInverses()
    }
  }

  /** Compute boneInverses from the current bone world matrices. */
  calculateInverses(): void {
    this.boneInverses = []
    for (const bone of this.bones) {
      const inv = new Float32Array(16)
      mat4Invert(inv, bone._worldMatrix)
      this.boneInverses.push(inv)
    }
  }

  /** Recompute boneMatrices from current bone world matrices and boneInverses. */
  update(): void {
    for (let i = 0; i < this.bones.length; i++) {
      mat4Multiply(_skelTemp, this.bones[i]._worldMatrix, this.boneInverses[i])
      this.boneMatrices.set(_skelTemp, i * 16)
    }
  }

  /** Reset all bones to their bind-pose transforms. */
  pose(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const inv = this.boneInverses[i]
      const bindPose = new Float32Array(16)
      mat4Invert(bindPose, inv)
      const bone = this.bones[i]
      // Extract TRS from bind pose world matrix
      bone.position.set(bindPose[12], bindPose[13], bindPose[14])
    }
  }

  dispose(): void {
    // GPU resources are managed by SkinnedMesh
  }
}

// ── SkinnedMesh ─────────────────────────────────────────────────────────

const _skinTemp1 = new Float32Array(16)
const _skinTemp2 = new Float32Array(16)
const _skinInvMesh = new Float32Array(16)

export class SkinnedMesh extends Object3D {
  readonly isSkinnedMesh = true
  readonly isMesh = true
  geometry: BufferGeometry
  material: MeshMaterial
  skeleton: Skeleton | null = null
  readonly bindMatrix = new Float32Array(16)
  readonly bindMatrixInverse = new Float32Array(16)

  /** Final bone matrices in mesh-local space, ready for GPU upload. */
  _boneMatrices: Float32Array = new Float32Array(0)
  /** GPU storage buffer for bone matrices. */
  _boneBuffer: GPUBuffer | null = null
  /** Bind group for the bone matrix storage buffer. */
  _boneBindGroup: GPUBindGroup | null = null
  _boneDevice: GPUDevice | null = null
  _bonesDirty = true

  constructor(geometry: BufferGeometry, material: MeshMaterial) {
    super()
    this.geometry = geometry
    this.material = material
    mat4Identity(this.bindMatrix)
    mat4Identity(this.bindMatrixInverse)
  }

  bind(skeleton: Skeleton, bindMatrix?: Float32Array): void {
    this.skeleton = skeleton
    this._boneMatrices = new Float32Array(skeleton.bones.length * 16)

    if (bindMatrix) {
      this.bindMatrix.set(bindMatrix)
      mat4Invert(this.bindMatrixInverse, this.bindMatrix)
    }
  }

  /**
   * Recompute bone matrices in mesh-local space from current skeleton pose.
   *
   * Formula: boneMatrix[i] = inverse(meshWorld) × bone[i].worldMatrix × boneInverse[i]
   *
   * This factors out the mesh's world transform so the shader can do:
   *   worldPos = modelMatrix × skinMatrix × vertex
   * where modelMatrix re-applies the mesh's world transform.
   */
  _updateBoneMatrices(): void {
    const sk = this.skeleton
    if (!sk) return

    // inverse of this mesh's world matrix — factors out scene-graph transforms
    mat4Invert(_skinInvMesh, this._worldMatrix)

    for (let i = 0; i < sk.bones.length; i++) {
      // raw = bone.worldMatrix × boneInverse (world-space deformation)
      mat4Multiply(_skinTemp1, sk.bones[i]._worldMatrix, sk.boneInverses[i])
      // local = inverse(meshWorld) × raw (mesh-local deformation)
      mat4Multiply(_skinTemp2, _skinInvMesh, _skinTemp1)
      this._boneMatrices.set(_skinTemp2, i * 16)
    }
    this._bonesDirty = true
  }

  /** Ensure bone matrix GPU buffer exists and is up-to-date. */
  _ensureBoneGPU(device: GPUDevice, layout: GPUBindGroupLayout): void {
    const byteSize = this._boneMatrices.byteLength
    if (byteSize === 0) return

    if (!this._boneBuffer || this._boneDevice !== device) {
      this._boneDevice = device
      if (this._boneBuffer) this._boneBuffer.destroy()
      this._boneBuffer = device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      this._boneBindGroup = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: this._boneBuffer } }],
      })
      this._bonesDirty = true
    }

    if (this._bonesDirty) {
      device.queue.writeBuffer(this._boneBuffer, 0, this._boneMatrices)
      this._bonesDirty = false
    }
  }

  dispose(): void {
    this._boneBuffer?.destroy()
    this._boneBuffer = null
    this._boneBindGroup = null
    this._boneDevice = null
  }
}
