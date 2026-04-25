// Modelo 3D estilizado del coche, construido a base de cajas y cilindros.
// Devuelve un THREE.Group cuya posición/rotación actualiza main.js.

import * as THREE from 'three';

export function buildCarMesh() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xd62828,
        roughness: 0.35,
        metalness: 0.55,
    });
    const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x111418,
        roughness: 0.15,
        metalness: 0.4,
        envMapIntensity: 1.0,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.85,
    });
    const headMat = new THREE.MeshStandardMaterial({
        color: 0xfff6c8,
        emissive: 0xfff1a8,
        emissiveIntensity: 1.4,
    });
    const tailMat = new THREE.MeshStandardMaterial({
        color: 0xff2d2d,
        emissive: 0xff0000,
        emissiveIntensity: 0.7,
    });

    // Cuerpo principal
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.85, 0.55, 4.3),
        bodyMat,
    );
    body.position.y = 0.65;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Falda inferior (más oscura)
    const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(1.95, 0.35, 4.35),
        new THREE.MeshStandardMaterial({ color: 0x2a0e0e, roughness: 0.6 }),
    );
    skirt.position.y = 0.32;
    skirt.castShadow = true;
    group.add(skirt);

    // Cabina / techo
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.6, 2.2),
        cabinMat,
    );
    cabin.position.set(0, 1.1, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // Cristal frontal inclinado
    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.05, 1.0),
        cabinMat,
    );
    windshield.position.set(0, 1.05, -1.4);
    windshield.rotation.x = -0.5;
    group.add(windshield);

    // Faros delanteros
    for (const x of [-0.6, 0.6]) {
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.18, 0.12),
            headMat,
        );
        head.position.set(x, 0.7, -2.13);
        group.add(head);
    }

    // Pilotos traseros
    for (const x of [-0.65, 0.65]) {
        const tail = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.15, 0.1),
            tailMat,
        );
        tail.position.set(x, 0.75, 2.13);
        group.add(tail);
    }

    // Ruedas
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const [x, z] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.45], [0.95, 1.45]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(x, 0.36, z);
        // YXZ -> primero giramos la dirección (steer) y después la rodadura.
        wheel.rotation.order = 'YXZ';
        wheel.castShadow = true;
        group.add(wheel);
        wheels.push(wheel);
    }

    // Foco delantero - luces como spotlights (sin shadow para perf)
    const headlight = new THREE.SpotLight(0xfff1c8, 6, 35, Math.PI / 6, 0.4, 1);
    headlight.position.set(0, 0.9, -2);
    headlight.target.position.set(0, 0, -10);
    group.add(headlight);
    group.add(headlight.target);

    group.userData.wheels = wheels;
    return group;
}

export function spinWheels(group, distanceMeters, steerRad) {
    const wheels = group.userData.wheels;
    if (!wheels) return;
    const angle = distanceMeters / 0.36;
    for (const w of wheels) w.rotation.x += angle;
    // Las dos ruedas delanteras (z negativo) giran con la dirección
    wheels[0].rotation.y = steerRad; // estos son los rotation.y locales tras posición
    wheels[1].rotation.y = steerRad;
}
