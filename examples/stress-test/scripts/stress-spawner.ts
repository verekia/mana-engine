import type { ManaScript } from 'mana-engine/game'

let spawned = false

export default {
  params: {
    clusters: { type: 'number', default: 4 },
    prefabsPerCluster: { type: 'number', default: 27 },
  },
  update(ctx) {
    if (spawned) return
    spawned = true

    const clusterCount = ctx.params.clusters as number
    const perCluster = ctx.params.prefabsPerCluster as number
    const cubeSize = Math.ceil(Math.cbrt(perCluster))
    const spacing = 2.5
    const orbitRadius = cubeSize * spacing + 5

    for (let c = 0; c < clusterCount; c++) {
      const baseAngle = (c / clusterCount) * Math.PI * 2
      const orbitSpeed = 0.15 + c * 0.04

      let count = 0
      for (let x = 0; x < cubeSize && count < perCluster; x++) {
        for (let y = 0; y < cubeSize && count < perCluster; y++) {
          for (let z = 0; z < cubeSize && count < perCluster; z++) {
            const offsetX = (x - (cubeSize - 1) / 2) * spacing
            const offsetY = (y - (cubeSize - 1) / 2) * spacing
            const offsetZ = (z - (cubeSize - 1) / 2) * spacing

            const spawnX = Math.cos(baseAngle) * orbitRadius + offsetX
            const spawnZ = Math.sin(baseAngle) * orbitRadius + offsetZ

            const id = ctx.instantiatePrefab('orbiter', { x: spawnX, y: offsetY, z: spawnZ })
            if (id) {
              ctx.emit('orbit-config', {
                entityId: id,
                orbitRadius,
                baseAngle,
                orbitSpeed,
                offsetX,
                offsetY,
                offsetZ,
              })
            }
            count++
          }
        }
      }
    }
  },
} satisfies ManaScript
