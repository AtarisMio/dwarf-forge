// Physical motion belongs to the view. Logical locations and ownership remain
// in ForgeGame; Rapier only settles dropped swords against the room and props.
export function createSwordPhysics(collisions) {
  let rapier, world, disposed = false, failed = false, pending = [], accumulator = 0;
  const bodies = new Map();
  const ready = import('@dimforge/rapier3d-compat').then(async module => {
    rapier = module.default; await rapier.init(); if (disposed) return;
    world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(rapier.ColliderDesc.cuboid(6, .1, 5).setTranslation(0, -.1, .5).setFriction(.78));
    for (const c of collisions) world.createCollider(rapier.ColliderDesc.cuboid(c.sx / 2, .7, c.sz / 2).setTranslation(c.x, .7, c.z).setFriction(.65));
    for (const [x, z, sx, sz] of [[-5.8, .5, .15, 5], [5.8, .5, .15, 5], [0, -3.75, 6, .15], [0, 5.05, 6, .15]]) world.createCollider(rapier.ColliderDesc.cuboid(sx, 2, sz).setTranslation(x, 2, z));
    sync(pending);
  }).catch(error => {
    failed = true; bodies.clear(); world?.free(); world = null;
    console.warn('Sword physics unavailable; using static floor placement.', error);
  });
  function safePosition(position, grounded = false) {
    const p = { x: Math.max(-4.45, Math.min(4.45, position.x)), y: grounded ? .065 : Math.max(.09, position.y ?? .11), z: Math.max(-2.45, Math.min(3.9, position.z)) };
    const blocked = z => p.y < 1.46 && collisions.some(c => Math.abs(p.x - c.x) < c.sx / 2 + 1.16 && Math.abs(z - c.z) < c.sz / 2 + .18);
    if (blocked(p.z)) { for (let offset = .4; offset < 6; offset += .4) { const z = Math.min(3.9, p.z + offset); if (!blocked(z)) { p.z = z; break; } } }
    return p;
  }
  function sync(swords) {
    pending = swords; if (!world || disposed) return;
    const ids = new Set(swords.map(s => s.id));
    for (const [id, entry] of bodies) if (!ids.has(id)) { world.removeRigidBody(entry.body); bodies.delete(id); }
    swords.forEach((s, i) => {
      const position = s.position || { x: -2.9 + i * .65, y: .11, z: 1.15 }, signature = JSON.stringify(position);
      if (bodies.get(s.id)?.signature === signature) return;
      if (bodies.has(s.id)) world.removeRigidBody(bodies.get(s.id).body);
      // Model-driven drops can replace an anvil/held sword at a nominal floor
      // pose inside a solid prop. Resolve that spawn before enabling dynamics.
      const p = safePosition(position);
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(.55).setAngularDamping(.8).setCcdEnabled(true));
      world.createCollider(rapier.ColliderDesc.cuboid(1.14, .052, .16).setDensity(.8).setFriction(.72).setRestitution(.09), body);
      body.setAngvel({ x: .08, y: ((i % 3) - 1) * .16, z: .04 }, true);
      bodies.set(s.id, { body, signature });
    });
  }
  function update(dt, renderObjects) {
    if (disposed) return;
    if (!world) {
      if (failed) pending.forEach((s, i) => {
        const mesh = renderObjects.get(s.id)?.mesh; if (!mesh) return;
        const p = safePosition(s.position || { x: -2.9 + i * .65, z: 1.15 }, true);
        mesh.position.set(p.x, p.y, p.z); mesh.quaternion.identity();
      });
      return;
    }
    accumulator = Math.min(accumulator + dt, .12);
    while (accumulator >= 1 / 60) { world.timestep = 1 / 60; world.step(); accumulator -= 1 / 60; }
    for (const [id, { body }] of bodies) { const mesh = renderObjects.get(id)?.mesh; if (!mesh) continue; mesh.position.copy(body.translation()); mesh.quaternion.copy(body.rotation()); }
  }
  function dispose() { disposed = true; bodies.clear(); world?.free(); world = null; }
  return { sync, update, dispose, ready };
}
